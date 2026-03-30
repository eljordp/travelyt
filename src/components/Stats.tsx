export default function Stats() {
  const stats = [
    { number: "500K+", label: "Passengers Served" },
    { number: "50+", label: "Airport Partners" },
    { number: "99.8%", label: "On-Time Delivery" },
    { number: "4.9/5", label: "Customer Rating" },
  ];

  const partners = [
    "Emirates",
    "Delta",
    "United",
    "British Airways",
    "Lufthansa",
    "KLM",
    "Qatar Airways",
    "Singapore Airlines",
  ];

  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-white to-blue-light">
      <div className="max-w-7xl mx-auto px-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-purple to-cyan bg-clip-text text-transparent mb-2">
                {stat.number}
              </div>
              <div className="text-sm text-navy/50 font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Partner Logos */}
        <div className="text-center">
          <span className="text-sm font-semibold text-navy/40 uppercase tracking-wider">
            Trusted by Leading Airlines
          </span>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {partners.map((partner) => (
              <div
                key={partner}
                className="text-navy/20 font-bold text-lg md:text-xl tracking-wide hover:text-navy/40 transition-colors"
              >
                {partner}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
