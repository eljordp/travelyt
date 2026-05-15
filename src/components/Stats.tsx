export default function Stats() {
  const pillars = [
    {
      title: "Built for the bag",
      desc: "Not another courier. A service designed around one job: getting your luggage where it needs to be.",
    },
    {
      title: "Tracked end-to-end",
      desc: "Every handoff logged. Every bag sealed. A live location you can check on your phone from pickup to drop-off.",
    },
    {
      title: "Fully insured",
      desc: "Coverage on every bag we touch, with clear terms before pickup and declared-value options for higher-value items.",
    },
    {
      title: "Pre-launch — early access open",
      desc: "We're onboarding partners and early customers now. Sign up and you'll be among the first to use the service at launch.",
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-white to-blue-light">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            Why Travelyt
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            A service that does one thing well
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
              <h3 className="text-lg font-bold text-navy mb-2">{p.title}</h3>
              <p className="text-sm text-navy/70 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
