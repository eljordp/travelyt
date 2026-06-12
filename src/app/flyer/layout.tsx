import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flyer",
  description: "Internal Travelyt print-ready flyer asset.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function FlyerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
