import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Travelyt account to request quotes and manage baggage pickups.",
  alternates: {
    canonical: "/register",
  },
};

export default function RegisterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
