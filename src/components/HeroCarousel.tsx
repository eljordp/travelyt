"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Slide = {
  src: string;
  alt: string;
  eyebrow: string;
  headline: string;
  body: string;
  cta: { href: string; label: string };
  objectPosition?: string;
};

const slides: Slide[] = [
  {
    src: "/carousel/pexels-business-traveler.jpg",
    alt: "Businessman in a tailored coat walking through an airport corridor with rolling luggage",
    eyebrow: "Built for business",
    headline: "Walk in. Board the plane. Move on.",
    body: "Your bags meet you at the airport — already weighed, sealed, and accounted for. No counter line. No hauling. Just travel.",
    cta: { href: "/quote", label: "Book bags" },
    objectPosition: "center 30%",
  },
  {
    src: "/carousel/pexels-door-family.jpg",
    alt: "Father and children packing a suitcase at home before a family trip",
    eyebrow: "Made for families",
    headline: "You handle the kids. We'll handle the bags.",
    body: "Doorstep pickup, sealed in transit, delivered to your destination — so you can travel with everyone without dragging six suitcases.",
    cta: { href: "/trust", label: "How it works" },
    objectPosition: "center 38%",
  },
  {
    src: "/carousel/pexels-frequent-flyer.jpg",
    alt: "Solo traveler in a camel coat walking through a modern airport with a white carry-on",
    eyebrow: "For the frequent flyer",
    headline: "Travel hands-free before you reach the airport.",
    body: "Door pickup at home, sealed in transit, and coordinated for your trip. The airport feels lighter when your bags are already handled.",
    cta: { href: "/pricing", label: "See pricing" },
    objectPosition: "center 35%",
  },
];

const ROTATE_MS = 6000;

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused]);

  return (
    <section
      className="relative h-[460px] overflow-hidden rounded-2xl bg-navy text-white shadow-2xl shadow-navy/15 sm:h-[520px] lg:h-[600px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured Travelyt services"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.src}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
            i === index ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={i !== index}
        >
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: slide.objectPosition }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/45 to-navy/20" />
          <div className="relative flex h-full flex-col justify-end p-6 sm:p-10 lg:p-12">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
              {slide.eyebrow}
            </p>
            <h2 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {slide.headline}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
              {slide.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={slide.cta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#ff6868]"
              >
                {slide.cta.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/quote"
                className="inline-flex items-center gap-2 rounded-xl bg-white/12 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20"
              >
                Get a quote
              </Link>
            </div>
          </div>
        </div>
      ))}

      <div className="absolute bottom-5 right-5 z-10 flex gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-8 bg-white" : "w-4 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
