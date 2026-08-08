import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account Security",
  description: "Manage Travelyt account verification, recovery, and two-factor authentication.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SecurityLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
