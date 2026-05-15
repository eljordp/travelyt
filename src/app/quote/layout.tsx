import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a Quote",
  description:
    "Request a Travelyt quote for doorstep baggage pickup, airport handoff, arrival delivery, or round-trip luggage handling.",
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
