import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage Travelyt account details and baggage bookings.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
