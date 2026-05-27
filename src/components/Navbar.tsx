"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy text-white">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image src="/logo-white.png" alt="Travelyt" width={140} height={48} className="h-10 w-auto" priority />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/pricing" className="hover:text-cyan transition-colors">Pricing</Link>
          <Link href="/airlines" className="hover:text-cyan transition-colors">Airlines</Link>
          <Link href="/trust" className="hover:text-cyan transition-colors">Trust</Link>
          <Link href="/demo" className="hover:text-cyan transition-colors">Demo</Link>
          <Link href="/#faq" className="hover:text-cyan transition-colors">FAQ</Link>
          <Link href="/login?next=%2Fprofile" className="text-white/90 hover:text-white transition-colors">Customer Login</Link>
          <Link href="/quote" className="bg-gradient-to-r from-purple to-purple-light text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
            Get a Quote
          </Link>
        </div>

        {/* Mobile Actions */}
        <div className="md:hidden flex items-center gap-3">
          <Link
            href="/login?next=%2Fprofile"
            className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white"
          >
            Login
          </Link>
          <button
            className="text-white"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="md:hidden bg-navy border-t border-white/10 px-6 pb-6 space-y-4">
          <Link href="/pricing" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>Pricing</Link>
          <Link href="/airlines" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>Airlines</Link>
          <Link href="/trust" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>Trust</Link>
          <Link href="/demo" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>Demo</Link>
          <Link href="/#faq" className="block py-2 hover:text-cyan" onClick={() => setOpen(false)}>FAQ</Link>
          <Link href="/login?next=%2Fprofile" className="block py-2 text-white/90 hover:text-white" onClick={() => setOpen(false)}>Customer Login</Link>
          <Link href="/quote" className="block bg-gradient-to-r from-purple to-purple-light text-white px-6 py-3 rounded-full text-center font-semibold" onClick={() => setOpen(false)}>
            Get a Quote
          </Link>
        </div>
      )}
    </nav>
  );
}
