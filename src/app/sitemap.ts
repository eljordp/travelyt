import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const routes = [
  "",
  "/pricing",
  "/airlines",
  "/trust",
  "/quote",
  "/login",
  "/register",
  "/privacy",
  "/terms",
  "/prohibited-items",
  "/support",
  "/for/embassies",
  "/cities/jfk",
  "/cities/lax",
  "/cities/ord",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/quote" ? 0.9 : 0.7,
  }));
}
