import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Business Cards",
  description: "Internal Travelyt print-ready business card assets.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function BusinessCardsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
