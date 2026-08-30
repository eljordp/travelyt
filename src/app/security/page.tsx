"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  MailCheck,
  Phone,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import type { Factor, User } from "@supabase/supabase-js";
import AppChrome from "@/components/AppChrome";
import {
  normalizePhone,
  roleRequiresMfa,
  safeAuthNext,
  trustedUserRole,
  validatePhone,
} from "@/lib/auth-policy";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import { SITE_URL } from "@/lib/site";

type AuthState = "loading" | "ready" | "signed-out" | "unconfigured";

type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

const phoneOtpEnabled =
  process.env.NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED === "true";

function loginUrl() {
  return `/login?next=${encodeURIComponent("/security")}`;
}

function qrDataUrl(value: string) {
  if (value.startsWith("data:")) return value;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`;
}

export default function SecurityPage() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [required] = useState(() =>
    typeof window === "undefined"
      ? false
      : new URLSearchParams(window.location.search).get("required") === "1",
  );
  const [destination] = useState(() =>
    typeof window === "undefined"
      ? "/profile"
      : safeAuthNext(
          new URLSearchParams(window.location.search).get("next"),
        ),
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phonePending, setPhonePending] = useState(false);

  async function refreshSecurityState() {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAuthState("unconfigured");
      return;
    }

    const [{ data: userData, error: userError }, { data: factorData }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.listFactors(),
      ]);

    if (userError || !userData.user) {
      setAuthState("signed-out");
      return;
    }

    setUser(userData.user);
    setFactors(factorData?.all ?? []);
    setPhone(userData.user.phone ?? "");
    setAuthState("ready");
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        if (active) setAuthState("unconfigured");
        return;
      }
      const [userResult, factorResult, assuranceResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (!active) return;
      const currentUser = userResult.data.user;
      if (userResult.error || !currentUser) {
        setAuthState("signed-out");
        return;
      }

      const verifiedTotp = factorResult.data?.totp ?? [];
      if (
        verifiedTotp.length > 0 &&
        assuranceResult.data?.currentLevel !== "aal2"
      ) {
        window.location.replace(
          `/mfa?next=${encodeURIComponent("/security")}`,
        );
        return;
      }

      setUser(currentUser);
      setFactors(factorResult.data?.all ?? []);
      setPhone(currentUser.phone ?? "");
      setAuthState("ready");
    })();

    return () => {
      active = false;
    };
  }, []);

  const verifiedTotp = factors.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  const emailVerified = Boolean(user?.email_confirmed_at);
  const phoneVerified = Boolean(user?.phone && user.phone_confirmed_at);
  const role = trustedUserRole(user);
  const mfaRequired = roleRequiresMfa(role);

  function resetMessages() {
    setError("");
    setNotice("");
  }

  async function resendEmailConfirmation() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !user?.email) return;
    resetMessages();
    setBusy("email");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent("/security")}`,
      },
    });
    setBusy("");
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setNotice("A new confirmation link was sent to your primary email.");
  }

  async function startTotpEnrollment() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    resetMessages();
    setBusy("totp-enroll");

    const { data: existing } = await supabase.auth.mfa.listFactors();
    const staleFactors = (existing?.all ?? []).filter(
      (factor) =>
        factor.factor_type === "totp" && factor.status === "unverified",
    );
    for (const factor of staleFactors) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Travelyt authenticator",
      issuer: "Travelyt",
    });
    setBusy("");
    if (enrollError) {
      setError(enrollError.message);
      return;
    }

    setEnrollment({
      factorId: data.id,
      qrCode: qrDataUrl(data.totp.qr_code),
      secret: data.totp.secret,
    });
    setTotpCode("");
  }

  async function verifyTotpEnrollment(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !enrollment) return;
    resetMessages();
    if (!/^\d{6}$/.test(totpCode.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy("totp-verify");
    const { error: verifyError } =
      await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code: totpCode.trim(),
      });
    setBusy("");
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    setEnrollment(null);
    setTotpCode("");
    await refreshSecurityState();
    if (required) {
      window.location.replace(destination);
      return;
    }
    setNotice("Authenticator two-factor authentication is now active.");
  }

  async function cancelTotpEnrollment() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !enrollment) return;
    setBusy("totp-cancel");
    await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    setBusy("");
    setEnrollment(null);
    setTotpCode("");
  }

  async function removeTotpFactor(factorId: string) {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    resetMessages();
    setBusy(`remove-${factorId}`);
    const { error: removeError } = await supabase.auth.mfa.unenroll({
      factorId,
    });
    setBusy("");
    if (removeError) {
      setError(removeError.message);
      return;
    }
    await refreshSecurityState();
    setNotice("Authenticator factor removed.");
  }

  async function startPhoneVerification(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !phoneOtpEnabled) return;
    resetMessages();
    const normalized = normalizePhone(phone);
    const phoneError = validatePhone(normalized);
    if (phoneError || !normalized.startsWith("+")) {
      setError(phoneError ?? "Use international format, such as +13125550123.");
      return;
    }

    setBusy("phone-start");
    const { error: updateError } = await supabase.auth.updateUser({
      phone: normalized,
    });
    setBusy("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPhone(normalized);
    setPhonePending(true);
    setNotice("Verification code sent by SMS.");
  }

  async function verifyPhone(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !phoneOtpEnabled) return;
    resetMessages();
    if (!/^\d{6}$/.test(phoneCode.trim())) {
      setError("Enter the 6-digit SMS code.");
      return;
    }
    setBusy("phone-verify");
    const { data: phoneData, error: phoneError } = await supabase.auth.verifyOtp({
      phone: normalizePhone(phone),
      token: phoneCode.trim(),
      type: "phone_change",
    });
    setBusy("");
    if (phoneError) {
      setError(phoneError.message);
      return;
    }

    const fallbackSession = phoneData.session
      ? null
      : await supabase.auth.getSession();
    const accessToken =
      phoneData.session?.access_token ??
      fallbackSession?.data.session?.access_token;
    let receiptResponse: Response | null = null;
    if (accessToken) {
      try {
        receiptResponse = await fetch("/api/auth/phone-verification-receipt", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: "same-origin",
        });
      } catch {
        // Supabase has already confirmed the number. Leave readiness false
        // until the server can persist the corresponding audit receipt.
      }
    }

    setPhoneCode("");
    setPhonePending(false);
    await refreshSecurityState();
    if (!receiptResponse?.ok) {
      setError(
        "Phone verified, but Travelyt could not record the audit proof. Contact support before relying on this verification.",
      );
      return;
    }
    setNotice("Phone number verified.");
  }

  if (authState === "loading") {
    return (
      <AppChrome title="Account Security" showBottomNav={false}>
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </AppChrome>
    );
  }

  if (authState === "signed-out") {
    return (
      <AppChrome title="Account Security" showBottomNav={false}>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-9 w-9 text-navy" />
          <h1 className="mt-3 text-xl font-bold text-navy">Sign in required</h1>
          <p className="mt-2 text-sm text-navy/65">
            Sign in before changing account security settings.
          </p>
          <Link href={loginUrl()} className="mt-5 inline-flex rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-semibold text-white">
            Sign in
          </Link>
        </div>
      </AppChrome>
    );
  }

  if (authState === "unconfigured") {
    return (
      <AppChrome title="Account Security" showBottomNav={false}>
        <div className="rounded-2xl bg-white p-6 text-sm text-navy/70 shadow-sm">
          Supabase authentication is not configured in this environment.
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title="Account Security" showBottomNav={false}>
      <div className="space-y-4">
        <div>
          <Link href="/profile" className="text-sm font-semibold text-[#ff6868] hover:underline">← Back to profile</Link>
          <h1 className="mt-3 text-2xl font-bold text-navy">Account Security</h1>
          <p className="mt-1 text-sm text-navy/65">
            Real verification status from your Travelyt authentication account.
          </p>
        </div>

        {(required || (mfaRequired && verifiedTotp.length === 0)) && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">Authenticator 2FA is required for this account role.</p>
              <p className="mt-1 text-xs leading-relaxed">Enrollment must be completed before continuing to privileged tools.</p>
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</p>}

        <SecurityCard icon={MailCheck} title="Primary email" verified={emailVerified}>
          <p className="break-all text-sm font-medium text-navy">{user?.email}</p>
          <p className="mt-1 text-xs leading-relaxed text-navy/60">
            Password recovery links go to this primary email. Travelyt does not claim a separate recovery-email feature.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/reset-password" className="rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white">Reset password</Link>
            {!emailVerified && (
              <button type="button" onClick={() => void resendEmailConfirmation()} disabled={busy === "email"} className="rounded-lg border border-navy/15 px-3 py-2 text-xs font-semibold text-navy disabled:opacity-50">
                {busy === "email" ? "Sending…" : "Resend confirmation"}
              </button>
            )}
          </div>
        </SecurityCard>

        <SecurityCard icon={KeyRound} title="Authenticator 2FA" verified={verifiedTotp.length > 0}>
          {verifiedTotp.length > 0 ? (
            <div className="space-y-3">
              {verifiedTotp.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between gap-3 rounded-xl bg-navy/[0.03] p-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{factor.friendly_name || "Authenticator app"}</p>
                    <p className="mt-0.5 text-xs text-navy/55">Added {new Date(factor.created_at).toLocaleDateString()}</p>
                  </div>
                  <button type="button" onClick={() => void removeTotpFactor(factor.id)} disabled={busy === `remove-${factor.id}` || (mfaRequired && verifiedTotp.length === 1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Remove authenticator">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {mfaRequired && <p className="text-xs text-navy/55">The last factor cannot be removed while this account has a privileged role.</p>}
            </div>
          ) : enrollment ? (
            <form onSubmit={verifyTotpEnrollment} className="space-y-4">
              <p className="text-sm leading-relaxed text-navy/70">Scan this code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
              <div className="flex justify-center rounded-xl border border-navy/10 bg-white p-3">
                <Image src={enrollment.qrCode} alt="Authenticator setup QR code" width={220} height={220} unoptimized />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-navy/55">Manual setup key</p>
                <code className="mt-1 block break-all rounded-lg bg-navy/[0.04] p-3 text-xs text-navy">{enrollment.secret}</code>
              </div>
              <div>
                <label htmlFor="totp-code" className="block text-xs font-semibold uppercase tracking-wide text-navy/60">6-digit code</label>
                <input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg tracking-[0.35em] outline-none focus:border-[#ff6868]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="submit" disabled={busy === "totp-verify"} className="rounded-xl bg-[#ff6868] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "totp-verify" ? "Verifying…" : "Verify and enable"}</button>
                <button type="button" onClick={() => void cancelTotpEnrollment()} disabled={busy === "totp-cancel"} className="rounded-xl border border-navy/15 px-4 py-3 text-sm font-semibold text-navy disabled:opacity-50">Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-navy/70">Use a rotating code from an authenticator app after your password. No SMS provider is required.</p>
              <button type="button" onClick={() => void startTotpEnrollment()} disabled={busy === "totp-enroll"} className="mt-3 rounded-xl bg-[#ff6868] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "totp-enroll" ? "Preparing…" : "Set up authenticator"}</button>
            </>
          )}
        </SecurityCard>

        <SecurityCard icon={Phone} title="Phone verification" verified={phoneVerified}>
          {!phoneOtpEnabled ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Not available yet</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">SMS verification stays disabled until a delivery provider and sender are configured and tested in Supabase.</p>
            </div>
          ) : phonePending ? (
            <form onSubmit={verifyPhone} className="space-y-3">
              <p className="text-sm text-navy/70">Enter the code sent to {phone}.</p>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneCode} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, ""))} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg tracking-[0.35em] outline-none focus:border-[#ff6868]" aria-label="SMS verification code" />
              <button type="submit" disabled={busy === "phone-verify"} className="w-full rounded-xl bg-[#ff6868] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "phone-verify" ? "Verifying…" : "Verify phone"}</button>
            </form>
          ) : (
            <form onSubmit={startPhoneVerification} className="space-y-3">
              <label htmlFor="security-phone" className="block text-xs font-semibold uppercase tracking-wide text-navy/60">Phone in international format</label>
              <input id="security-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+13125550123" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#ff6868]" />
              <button type="submit" disabled={busy === "phone-start"} className="w-full rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "phone-start" ? "Sending…" : phoneVerified ? "Change verified phone" : "Send verification code"}</button>
            </form>
          )}
        </SecurityCard>

        <div className="rounded-2xl border border-navy/10 bg-white p-5 text-xs leading-relaxed text-navy/60 shadow-sm">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
            <p>Account authentication confirms control of login factors. Government ID and liveness checks for custody eligibility are a separate verification process.</p>
          </div>
        </div>
      </div>
    </AppChrome>
  );
}

function SecurityCard({
  icon: Icon,
  title,
  verified,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  verified: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5 text-navy"><Icon className="h-5 w-5" strokeWidth={2} /></span>
        <h2 className="min-w-0 flex-1 text-base font-bold text-navy">{title}</h2>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${verified ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
          {verified && <CheckCircle2 className="h-3.5 w-3.5" />}
          {verified ? "Verified" : "Not verified"}
        </span>
      </div>
      {children}
    </section>
  );
}
