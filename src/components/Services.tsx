export default function Services() {
  const services = [
    {
      label: "Departures",
      title: "Doorstep Check-in",
      description:
        "Our certified agents arrive at your door, weigh and tag your bags, print your boarding pass, handle excess baggage payments, and arrange seat selection. Walk straight to the gate — no queues, no stress.",
      features: [
        "Passenger & baggage check-in",
        "Boarding pass printing",
        "Baggage tag generation",
        "Excess baggage payment",
        "Seat selection assistance",
        "Expedited gate access",
      ],
      image: "/service-departures.jpg",
    },
    {
      label: "Arrivals",
      title: "Land & Leave",
      description:
        "Skip baggage claim entirely. We collect your bags from the carousel, clear customs, and deliver them to your hotel, home, or any address. You walk off the plane and go.",
      features: [
        "Baggage carousel collection",
        "Customs clearance integration",
        "Door-to-door delivery",
        "Real-time tracking updates",
        "Same-day delivery guarantee",
        "Multi-bag support",
      ],
      image: "/service-arrivals.jpg",
    },
    {
      label: "Transfer",
      title: "City-to-City Baggage",
      description:
        "Traveling between cities? We move your bags between airports, hotels, and addresses so you can explore hands-free. Perfect for multi-city itineraries.",
      features: [
        "Hotel-to-hotel transfers",
        "Airport-to-address delivery",
        "Multi-city routing",
        "Scheduled pickups",
        "Storage options available",
        "Group & family plans",
      ],
      image: "/service-transfer.jpg",
    },
  ];

  return (
    <section id="services" className="py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            Our Services
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Every leg of your journey, covered
          </h2>
          <p className="text-navy/60 max-w-2xl mx-auto">
            From your front door to your final destination — we handle your
            luggage so you can focus on what matters.
          </p>
        </div>

        <div className="space-y-20">
          {services.map((service, i) => (
            <div
              key={service.title}
              className={`flex flex-col ${
                i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"
              } gap-12 items-center`}
            >
              {/* Visual */}
              <div className="flex-1 w-full">
                <div className="rounded-3xl overflow-hidden aspect-[4/3]">
                  <img
                    src={service.image}
                    alt={service.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1">
                <span
                  className="inline-block text-xs font-bold uppercase tracking-wider text-cyan mb-3"
                >
                  {service.label}
                </span>
                <h3 className="text-2xl md:text-4xl font-bold text-navy mb-4">
                  {service.title}
                </h3>
                <p className="text-navy/60 leading-relaxed mb-6">
                  {service.description}
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-navy/70">
                      <svg
                        className="w-4 h-4 text-cyan flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
