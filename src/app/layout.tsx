import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import NativeBoot from "@/components/NativeBoot";
import StickyPromoBar from "@/components/StickyPromoBar";

const siteUrl = "https://travelyt-psi.vercel.app";
const siteDescription =
  "Travelyt picks up, seals, tracks, and transports your luggage so you can travel through the airport hands-free.";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Travelyt — Travel Light, Arrive Smart",
    template: "%s | Travelyt",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    siteName: "Travelyt",
    title: "Travelyt — Travel Light, Arrive Smart",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Travelyt — Travel Light, Arrive Smart",
    description: siteDescription,
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
