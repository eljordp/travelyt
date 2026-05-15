import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Driver Console",
  description: "Travelyt driver console for demo baggage pickup and delivery workflows.",
  alternates: {
    canonical: "/driver",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function DriverLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
