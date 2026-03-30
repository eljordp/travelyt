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
              <button className="bg-cyan text-navy font-semibold px-5 py-3 rounded-r-xl text-sm hover:bg-cyan/90 transition-colors">
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
            {/* Social icons */}
            {["Instagram", "LinkedIn", "X"].map((social) => (
              <a
                key={social}
                href="#"
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-cyan hover:bg-white/10 transition-all text-xs font-bold"
              >
                {social[0]}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
