import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import NativeBoot from "@/components/NativeBoot";
import StickyPromoBar from "@/components/StickyPromoBar";
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
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NativeBoot />
        {children}
        <StickyPromoBar />
      </body>
    </html>
  );
}
