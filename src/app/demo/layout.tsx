import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App Walkthrough",
  description:
    "Walk through Travelyt customer booking, customer trips, courier jobs, and operations review.",
  alternates: {
    canonical: "/demo",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
