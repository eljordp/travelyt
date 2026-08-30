import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function requestFingerprint(request: Request, subject = "") {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "unknown";
  const secret = process.env.TRAVELYT_CONSENT_HASH_SECRET?.trim() ||
    process.env.TRAVELYT_ADMIN_SESSION_SECRET?.trim();
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`${ip}\n${subject.trim().slice(0, 512)}`)
    .digest("hex");
}

export async function durableRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
  subject = "",
) {
  if (
    !/^[a-z0-9:_-]{3,120}$/i.test(scope) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isFinite(windowMs) ||
    windowMs < 1_000 ||
    windowMs > 86_400_000
  ) {
    console.error("Invalid durable rate-limit configuration", { scope, limit, windowMs });
    return NextResponse.json(
      { ok: false, error: "Security throttling is not configured." },
      { status: 503 },
    );
  }
  const identifierHash = requestFingerprint(request, subject);
  const supabase = getSupabaseAdmin();
  if (!identifierHash || !supabase) {
    return NextResponse.json(
      { ok: false, error: "Security throttling is not configured." },
      { status: 503 },
    );
  }
  const { data, error } = await supabase.rpc("consume_request_rate_limit", {
    p_scope: scope,
    p_identifier_hash: identifierHash,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });
  if (error) {
    console.error("Durable rate-limit check failed", error);
    return NextResponse.json(
      { ok: false, error: "Security throttling is temporarily unavailable." },
      { status: 503 },
    );
  }
  return data === true
    ? null
    : NextResponse.json(
        { ok: false, error: "Too many attempts. Wait before trying again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } },
      );
}
