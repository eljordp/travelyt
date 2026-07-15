import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import NativeBoot from "@/components/NativeBoot";
import SiteAnalytics from "@/components/SiteAnalytics";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import StickyPromoBar from "@/components/StickyPromoBar";
import { GA4_MEASUREMENT_ID } from "@/lib/analytics";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Travelyt — Travel Light, Arrive Smart",
    template: "%s | Travelyt",
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Travelyt",
    title: "Travelyt — Travel Light, Arrive Smart",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Travelyt — Travel Light, Arrive Smart",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const measurementId = JSON.stringify(GA4_MEASUREMENT_ID);

  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      {GA4_MEASUREMENT_ID ? (
        <head>
          <script
            id="travelyt-ga4"
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
                window.gtag('config', ${measurementId}, { send_page_view: false });
              `,
            }}
          />
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`}
          />
        </head>
      ) : null}
      <body className="min-h-full flex flex-col">
        <NativeBoot />
        <SiteAnalytics />
        <AnalyticsConsent />
        {children}
        <StickyPromoBar />
      </body>
    </html>
  );
}
