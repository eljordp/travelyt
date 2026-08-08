import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Two-Factor Verification",
  description: "Complete two-factor verification for your Travelyt account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MfaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
