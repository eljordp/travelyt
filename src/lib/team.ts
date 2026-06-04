export type TeamMember = {
  slug: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  city?: string;
  bio?: string;
};

export const TEAM: Record<string, TeamMember> = {
  daniel: {
    slug: "daniel",
    name: "Daniel Gyanor",
    role: "Co-Founder",
    phone: "",
    email: "daniel@travellight.com",
    city: "Atlanta, GA",
    bio: "Co-founder. Airline & TSA partnerships.",
  },
  danielle: {
    slug: "danielle",
    name: "Danielle Gyanor",
    role: "CEO & Co-Founder",
    phone: "",
    email: "danielle@travellight.com",
    city: "Atlanta, GA",
    bio: "Co-founder. Operations & growth.",
  },
  mo: {
    slug: "mo",
    name: "Mohammed",
    role: "Co-Founder",
    phone: "",
    email: "mo@travellight.com",
    bio: "Co-founder. Strategy & finance.",
  },
  zaina: {
    slug: "zaina",
    name: "Zaina Daoud",
    role: "Operations",
    phone: "",
    email: "zaina@travellight.com",
    bio: "Operations & partner relations.",
  },
};

export function getMember(slug: string): TeamMember | null {
  return TEAM[slug.toLowerCase()] ?? null;
}
