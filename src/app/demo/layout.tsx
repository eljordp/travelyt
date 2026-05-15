import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo",
  description:
    "Try the Travelyt booking prototype, driver console, and print-ready flyer.",
  alternates: {
    canonical: "/demo",
  },
};

export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
