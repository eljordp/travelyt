"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GA4_MEASUREMENT_ID,
  setupClickTracking,
  shouldSuppressAnalytics,
  trackPageView,
} from "@/lib/analytics";

function SiteAnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!GA4_MEASUREMENT_ID) return;
    setupClickTracking();
  }, []);

  useEffect(() => {
    if (!GA4_MEASUREMENT_ID || shouldSuppressAnalytics(pathname)) return;
    const path = search ? `${pathname}?${search}` : pathname;
    trackPageView(path);
  }, [pathname, search]);

  if (!GA4_MEASUREMENT_ID) return null;

  return null;
}

export default function SiteAnalytics() {
  return (
    <Suspense fallback={null}>
      <SiteAnalyticsInner />
    </Suspense>
  );
}
