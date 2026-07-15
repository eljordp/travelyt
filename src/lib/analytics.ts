"use client";

export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsParams = Record<string, AnalyticsValue>;

export const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";

const INTERNAL_VERIFICATION_SOURCE = "codex";
const INTERNAL_VERIFICATION_MEDIUM = "verification";
const DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const SUPPRESSED_PATH_PREFIXES = ["/admin", "/backup", "/driver", "/demo"];

declare global {
  interface Window {
    __travelytClickTracking?: boolean;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function cleanParams(params: AnalyticsParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  );
}

export function isSuppressedAnalyticsPath(pathname: string) {
  return SUPPRESSED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function shouldSuppressAnalytics(pathname?: string) {
  if (typeof window === "undefined") return false;
  if (DEV_HOSTNAMES.has(window.location.hostname)) return true;

  const path = pathname ?? window.location.pathname;
  if (isSuppressedAnalyticsPath(path)) return true;

  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source")?.toLowerCase();
  const medium = params.get("utm_medium")?.toLowerCase();
  return source === INTERNAL_VERIFICATION_SOURCE && medium === INTERNAL_VERIFICATION_MEDIUM;
}

export function ensureGtag() {
  if (typeof window === "undefined" || !GA4_MEASUREMENT_ID) return false;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  return true;
}

export function trackPageView(path: string) {
  if (!ensureGtag() || shouldSuppressAnalytics()) return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    send_to: GA4_MEASUREMENT_ID,
  });
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (!ensureGtag() || shouldSuppressAnalytics()) return;
  window.gtag?.("event", name, {
    ...cleanParams(params),
    send_to: GA4_MEASUREMENT_ID,
  });
}

export function trackLeadSubmission(params: {
  source: string;
  interest?: string | null;
  service?: string | null;
  airport?: string | null;
}) {
  trackEvent("lead_captured", {
    source: params.source,
    interest: params.interest || undefined,
    service: params.service || undefined,
    airport: params.airport || undefined,
  });
}

export function trackBookingRequestCreated(params: {
  bookingId: string;
  service: string;
  airport: string;
  bags: number;
  value: number;
  promoCode?: string | null;
}) {
  trackEvent("booking_request_created", {
    booking_id: params.bookingId,
    service: params.service,
    airport: params.airport,
    bags: params.bags,
    value: params.value,
    currency: "USD",
    promo_code: params.promoCode || undefined,
  });
}

export type AnalyticsConsent = "granted" | "denied";

export function updateAnalyticsConsent(consent: AnalyticsConsent) {
  if (!ensureGtag()) return;
  window.gtag?.("consent", "update", {
    analytics_storage: consent,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

export function trackBeginCheckout(params: {
  bookingId: string;
  service: string;
  airport: string;
  bags: number;
  value: number;
}) {
  trackEvent("begin_checkout", {
    booking_id: params.bookingId,
    service: params.service,
    airport: params.airport,
    bags: params.bags,
    value: params.value,
    currency: "USD",
  });
}

export function trackPurchase(params: {
  bookingId: string;
  checkoutSessionId?: string | null;
  service: string;
  airport: string;
  bags: number;
  value: number;
}) {
  trackEvent("purchase", {
    transaction_id: params.checkoutSessionId || params.bookingId,
    booking_id: params.bookingId,
    checkout_session_id: params.checkoutSessionId || undefined,
    service: params.service,
    airport: params.airport,
    bags: params.bags,
    value: params.value,
    currency: "USD",
  });
}

export function setupClickTracking() {
  if (typeof window === "undefined" || window.__travelytClickTracking) return;
  window.__travelytClickTracking = true;

  document.addEventListener("click", (event) => {
    if (shouldSuppressAnalytics()) return;
    const target = event.target instanceof Element ? event.target : null;
    const clickable = target?.closest("a[href], button");
    if (!clickable) return;

    const label =
      clickable.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
      clickable.getAttribute("aria-label") ||
      clickable.tagName.toLowerCase();

    if (!(clickable instanceof HTMLAnchorElement)) return;
    const href = clickable.getAttribute("href") || "";
    const params = {
      path: window.location.pathname,
      label,
      href,
    };

    if (href.startsWith("tel:")) {
      trackEvent("phone_click", params);
    } else if (href.startsWith("sms:")) {
      trackEvent("sms_click", params);
    } else if (href.startsWith("mailto:")) {
      trackEvent("email_click", params);
    } else if (href.includes("/quote")) {
      trackEvent("quote_cta_click", params);
    } else if (href.includes("/driver/apply")) {
      trackEvent("driver_apply_click", params);
    }
  });
}
