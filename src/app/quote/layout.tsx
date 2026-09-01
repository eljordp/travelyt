import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a Quote",
  description:
    "Request review of a Travelyt baggage route. Pricing, timing, coverage, and the exact handoff model are subject to confirmation.",
  alternates: {
    canonical: "/quote",
  },
  openGraph: {
    title: "Request a Quote | Travelyt",
    description:
      "Tell Travelyt where and when you are traveling and get a baggage handling quote.",
    url: "/quote",
  },
};

export default function QuoteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
