import Image from "next/image";
import Link from "next/link";
import LeadCapture from "./LeadCapture";

export default function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="inline-block">
              <Image src="/logo-white.png" alt="Travelyt" width={140} height={48} className="h-10 w-auto" />
            </Link>
            <p className="text-white/60 text-sm mt-4 leading-relaxed">
              Travel light, arrive smart. Door-to-door baggage solutions for the
              modern traveler.
            </p>
          </div>

          {/* Services */}
          <div>
            <div className="font-semibold text-sm uppercase tracking-wider text-white/70 mb-4">
              Services
            </div>
            <ul className="space-y-3 text-sm text-white/60">
              <li>
                <Link href="/#services" className="hover:text-cyan transition-colors">
                  Doorstep Pickup
                </Link>
              </li>
              <li>
                <Link href="/#services" className="hover:text-cyan transition-colors">
                  Land & Leave
                </Link>
              </li>
              <li>
                <Link href="/#services" className="hover:text-cyan transition-colors">
                  City-to-City Baggage
                </Link>
              </li>
              <li>
                <Link href="/trust" className="hover:text-cyan transition-colors">
                  Trust & Security
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <div className="font-semibold text-sm uppercase tracking-wider text-white/70 mb-4">
              Company
            </div>
            <ul className="space-y-3 text-sm text-white/60">
              <li>
                <Link href="/trust" className="hover:text-cyan transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/#early-access" className="hover:text-cyan transition-colors">
                  Partners
                </Link>
              </li>
              <li>
                <Link href="/demo" className="hover:text-cyan transition-colors">
                  Demo
                </Link>
              </li>
              <li>
                <Link href="/quote" className="hover:text-cyan transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <div className="font-semibold text-sm uppercase tracking-wider text-white/70 mb-4">
              Stay Updated
            </div>
            <p className="text-white/60 text-sm mb-4">
              Get early access updates before public launch.
            </p>
            <LeadCapture source="footer" variant="footer" />
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-white/70 text-sm">
            &copy; 2026 Travelyt, Inc. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm text-white/70">
            <Link href="/privacy" className="hover:text-cyan transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-cyan transition-colors">
              Terms
            </Link>
            <Link href="/privacy#cookies" className="hover:text-cyan transition-colors">
              Cookies
            </Link>
          </div>
          <Link
            href="/#early-access"
            className="text-sm font-semibold text-white/70 hover:text-cyan transition-colors"
          >
            Early access
          </Link>
        </div>
      </div>
    </footer>
  );
}
