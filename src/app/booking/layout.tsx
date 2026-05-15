import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking",
  description: "View and manage a Travelyt baggage booking.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function BookingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
