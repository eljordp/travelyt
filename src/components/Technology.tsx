export default function Technology() {
  const features = [
    {
      title: "Live Bag Tracking",
      description:
        "A GPS-enabled tag and a shareable tracking link. Watch your luggage move from your door to your destination in real time.",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      title: "Tamper-Evident Seals",
      description:
        "Every bag is sealed at pickup with a uniquely numbered seal. Any break is logged and flagged instantly — you know if anything changes hands unexpectedly.",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      title: "Digital Chain of Custody",
      description:
        "Every handoff is logged with timestamp, location, and operator ID. Full digital audit trail from pickup to delivery.",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      title: "Smart Booking Platform",
      description:
        "Book a pickup, manage your itinerary, and get SMS and email updates at every checkpoint — from a simple, fast web experience.",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: "Operator Dispatch",
      description:
        "Routing and scheduling tools keep drivers on time and bags on-route — so pickups and deliveries land in the window we promised.",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      title: "Last-Mile Network",
      description:
        "A focused delivery network for the final leg — residences, hotel lobbies, serviced apartments, and pickup points.",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];

  return (
    <section id="technology" className="py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            Our Technology
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Built around the bag
          </h2>
          <p className="text-navy/60 max-w-2xl mx-auto">
            Simple tools that make baggage logistics feel effortless — for the
            traveler and the operator.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group p-8 rounded-2xl border border-gray-100 hover:border-purple/20 hover:shadow-lg hover:shadow-purple/5 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple/10 to-cyan/10 flex items-center justify-center text-purple mb-5 group-hover:from-purple/20 group-hover:to-cyan/20 transition-colors">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-navy mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-navy/50 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
