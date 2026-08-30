import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { durableRateLimit } from "@/lib/durable-rate-limit";
import { resolveServerRouteDistance } from "@/lib/server-route-distance";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "address:verify", 30);
  if (limited) return limited;
  const durableLimited = await durableRateLimit(request, "address:verify", 30, 60_000);
  if (durableLimited) return durableLimited;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return bad("Address verification is not configured yet.", 503);
  }

  try {
    const body = (await request.json()) as {
      address?: string;
      airport?: string;
    };
    const address = body.address?.trim();

    if (!address) return bad("Address is required.");
    const result = await resolveServerRouteDistance({
      apiKey,
      address,
      airportCode: body.airport ?? "",
    });
    if (!result.ok) return bad(result.error, result.status);

    return NextResponse.json(result);
  } catch {
    return bad("We could not verify that address.", 400);
  }
}
