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
};

const slides: Slide[] = [
  {
    src: "/carousel/slide-1-door.jpg",
    alt: "Concierge collecting a guest's luggage at a hotel lobby",
    eyebrow: "Door to gate",
    headline: "We move your bags. You move freely.",
    body: "A Travelyt courier picks up at your door, seals your bag, and hands it off at the airport for your flight.",
    cta: { href: "/quote", label: "Book bags" },
  },
  {
    src: "/carousel/slide-2-airport.jpg",
    alt: "Sealed Travelyt suitcase at an airline acceptance counter",
    eyebrow: "Sealed + tracked",
    headline: "Every bag, every hop, fully accounted for.",
    body: "Tamper-evident seal, weighed at pickup, scanned at the airport, status live in your app the whole way.",
    cta: { href: "/trust", label: "How it works" },
  },
  {
    src: "/carousel/slide-3-arrival.jpg",
    alt: "Traveler arriving empty-handed at a boutique hotel",
    eyebrow: "Arrive empty-handed",
    headline: "Skip the carousel. We meet your bags.",
    body: "Land, leave the airport, walk into your hotel. Your bags are already there.",
    cta: { href: "/pricing", label: "See pricing" },
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
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/45 to-navy/20" />
          <div className="relative flex h-full flex-col justify-end p-6 sm:p-10 lg:p-12">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#ff747d]">
              {slide.eyebrow}
            </p>
            <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {slide.headline}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
              {slide.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={slide.cta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-[#c41e2a] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#e63946]"
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
