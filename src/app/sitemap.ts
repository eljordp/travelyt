import type { MetadataRoute } from "next";

const baseUrl = "https://travelyt-psi.vercel.app";

const routes = [
  "",
  "/pricing",
  "/airlines",
  "/trust",
  "/quote",
  "/login",
  "/register",
  "/driver",
  "/privacy",
  "/terms",
  "/cities/jfk",
  "/cities/lax",
  "/cities/ord",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/quote" ? 0.9 : 0.7,
  }));
}
