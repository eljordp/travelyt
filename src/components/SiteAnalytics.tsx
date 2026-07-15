"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import {
  ensureGtag,
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

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`}
        strategy="afterInteractive"
      />
      <Script
        id="travelyt-ga4"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
            var travelytAnalyticsConsent = 'denied';
            try {
              if (window.localStorage.getItem('travelyt_analytics_consent') === 'granted') {
                travelytAnalyticsConsent = 'granted';
              }
            } catch (error) {}
            window.gtag('consent', 'default', {
              analytics_storage: travelytAnalyticsConsent,
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              wait_for_update: 500
            });
            window.gtag('js', new Date());
            window.gtag('config', '${GA4_MEASUREMENT_ID}', { send_page_view: false });
          `,
        }}
        onLoad={() => {
          ensureGtag();
        }}
      />
    </>
  );
}

export default function SiteAnalytics() {
  return (
    <Suspense fallback={null}>
      <SiteAnalyticsInner />
    </Suspense>
  );
}
