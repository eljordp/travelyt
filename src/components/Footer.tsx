export default function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="#" className="text-2xl font-bold tracking-tight">
              travel<span className="text-cyan">yt</span>
            </a>
            <p className="text-white/40 text-sm mt-4 leading-relaxed">
              Travel light, arrive smart. Door-to-door baggage solutions for the
              modern traveler.
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/60 mb-4">
              Services
            </h4>
            <ul className="space-y-3 text-sm text-white/40">
              <li>
                <a href="#services" className="hover:text-cyan transition-colors">
                  Doorstep Check-in
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-cyan transition-colors">
                  Land & Leave
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-cyan transition-colors">
                  City-to-City Baggage
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-cyan transition-colors">
                  Airline Partnerships
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/60 mb-4">
              Company
            </h4>
            <ul className="space-y-3 text-sm text-white/40">
              <li>
                <a href="#" className="hover:text-cyan transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-cyan transition-colors">
                  Careers
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-cyan transition-colors">
                  Press
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-cyan transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/60 mb-4">
              Stay Updated
            </h4>
            <p className="text-white/40 text-sm mb-4">
              Get travel tips and exclusive offers.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 bg-white/5 border border-white/10 rounded-l-xl px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan/50 transition-colors"
              />
              <button className="bg-cyan text-white font-semibold px-5 py-3 rounded-r-xl text-sm hover:bg-cyan/90 transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-white/30 text-sm">
            &copy; 2026 Travelyt, Inc. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm text-white/30">
            <a href="#" className="hover:text-cyan transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-cyan transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-cyan transition-colors">
              Cookies
            </a>
          </div>
          <div className="flex gap-4">
            {/* Instagram */}
            <a
              href="#"
              aria-label="Instagram"
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-cyan hover:bg-white/10 transition-all"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            {/* LinkedIn */}
            <a
              href="#"
              aria-label="LinkedIn"
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-cyan hover:bg-white/10 transition-all"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
            {/* X / Twitter */}
            <a
              href="#"
              aria-label="X"
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-cyan hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
