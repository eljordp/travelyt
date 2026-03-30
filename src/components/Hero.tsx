export default function Hero() {
  return (
    <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
      {/* Hero background image */}
      <div className="absolute inset-0">
        <img src="/hero-travel.jpg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/50 to-white" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-10 text-xs sm:text-sm text-white/70">
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Airline Approved
          </span>
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Fully Insured
          </span>
          <span className="hidden sm:flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Real-Time Tracking
          </span>
        </div>

        {/* Headline */}
        <div className="text-center max-w-4xl mx-auto mb-12">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6">
            Travel Light.
            <br />
            <span className="text-cyan">
              Arrive Smart.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            We pick up your bags from your door, check you in, and deliver
            everything to your destination. Skip the airport queues forever.
          </p>
        </div>

        {/* Booking Form */}
        <div
          id="book"
          className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl shadow-navy/5 p-6 md:p-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="pickup" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-2">
                Pickup Location
              </label>
              <input
                id="pickup"
                name="pickup"
                type="text"
                placeholder="Your address"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple focus:ring-2 focus:ring-purple/20 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label htmlFor="destination" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-2">
                Destination Airport
              </label>
              <input
                id="destination"
                name="destination"
                type="text"
                placeholder="e.g. LAX, JFK"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple focus:ring-2 focus:ring-purple/20 outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label htmlFor="travel-date" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-2">
                Travel Date
              </label>
              <input
                id="travel-date"
                name="travel-date"
                type="date"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple focus:ring-2 focus:ring-purple/20 outline-none transition-all text-sm text-navy/70"
              />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-gradient-to-r from-purple to-purple-light text-white py-3 px-6 rounded-xl font-semibold hover:opacity-90 transition-opacity text-sm cursor-pointer">
                Get Quote
              </button>
            </div>
          </div>
        </div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
          {[
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              ),
              title: "Doorstep Check-in",
              desc: "We come to you. Bags tagged, boarding pass printed, you're done.",
            },
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Land & Leave",
              desc: "Walk off the plane hands-free. We deliver your bags to any address.",
            },
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ),
              title: "Fully Secured",
              desc: "Real-time GPS tracking, tamper-proof seals, and full insurance coverage.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="bg-white rounded-2xl p-6 shadow-lg shadow-navy/5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple/10 to-cyan/10 flex items-center justify-center text-purple mb-4">
                {card.icon}
              </div>
              <h3 className="text-lg font-bold text-navy mb-2">{card.title}</h3>
              <p className="text-sm text-navy/60 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
