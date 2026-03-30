export default function Sustainability() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-navy via-navy-light to-navy text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-sm font-semibold text-cyan uppercase tracking-wider">
              Sustainability
            </span>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 mb-6">
              Smarter logistics,
              <br />
              smaller footprint
            </h2>
            <p className="text-white/60 leading-relaxed mb-8">
              By optimizing routes and consolidating deliveries, Travelyt
              reduces the carbon footprint of baggage handling while cutting
              airport congestion. Fewer individual trips means less emissions
              and a better travel experience for everyone.
            </p>
            <div className="space-y-4">
              {[
                "Carbon footprint reduction through optimized logistics",
                "Efficient resource utilization across all operations",
                "Airport congestion reduction up to 30%",
                "Working toward ISO 14001:2015 certification",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-cyan mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-white/70 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual */}
          <div className="relative">
            <div className="bg-gradient-to-br from-cyan/20 to-purple/20 rounded-3xl p-12 md:p-16 aspect-square flex items-center justify-center">
              <div className="text-center">
                <div className="text-7xl md:text-9xl font-bold text-white/10 mb-4">
                  30%
                </div>
                <div className="text-lg font-semibold text-cyan">
                  Less Airport Congestion
                </div>
                <div className="text-sm text-white/40 mt-2">
                  Through optimized baggage logistics
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
