"use client";

import { useState } from "react";
import Image from "next/image";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy text-white">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <Image src="/logo.png" alt="Travelyt" width={140} height={48} className="h-10 w-auto brightness-0 invert" priority />
        </a>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <a href="#services" className="hover:text-cyan transition-colors">Services</a>
          <a href="#how-it-works" className="hover:text-cyan transition-colors">How It Works</a>
          <a href="#technology" className="hover:text-cyan transition-colors">Technology</a>
          <a href="#faq" className="hover:text-cyan transition-colors">FAQ</a>
          <a href="/login" className="text-white/70 hover:text-white transition-colors">Sign In</a>
          <a href="/quote" className="bg-gradient-to-r from-purple to-purple-light text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
            Get a Quote
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-white"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {open ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="md:hidden bg-navy border-t border-white/10 px-6 pb-6 space-y-4">
          <a href="#services" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>Services</a>
          <a href="#how-it-works" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>How It Works</a>
          <a href="#technology" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>Technology</a>
          <a href="#faq" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>FAQ</a>
          <a href="/login" className="block py-2 text-white/70 hover:text-white" onClick={() => setOpen(false)}>Sign In</a>
          <a href="/quote" className="block bg-gradient-to-r from-purple to-purple-light text-white px-6 py-3 rounded-full text-center font-semibold" onClick={() => setOpen(false)}>
            Get a Quote
          </a>
        </div>
      )}
    </nav>
  );
}
