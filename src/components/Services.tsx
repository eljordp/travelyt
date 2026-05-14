export default function Services() {
  const services = [
    {
      label: "Departures",
      title: "Doorstep-to-Terminal",
      description:
        "We pick up your luggage at your door, weigh and seal every bag, and transport it to the airport. You arrive hands-free — ready to breeze through the line with nothing to lug.",
      features: [
        "Scheduled doorstep pickup",
        "Weighing and tamper-proof sealing",
        "Airline-compliant bag prep",
        "Live GPS tracking",
        "Curbside or terminal meet-up",
        "Insurance on every bag",
      ],
      image: "/service-departures.jpg",
    },
    {
      label: "Arrivals",
      title: "Land & Leave",
      description:
        "Skip baggage claim. After your flight lands, our team collects your bags and delivers them to your hotel, home, or any address. You walk off the plane and go.",
      features: [
        "Post-flight bag collection",
        "Door-to-door delivery",
        "Real-time tracking updates",
        "Same-day delivery windows",
        "Multi-bag support",
        "Secure chain of custody",
      ],
      image: "/service-arrivals.jpg",
    },
    {
      label: "Transfer",
      title: "City-to-City Baggage",
      description:
        "Traveling between cities? We move your bags between hotels and addresses so you can explore hands-free. Purpose-built for multi-stop itineraries and extended trips.",
      features: [
        "Hotel-to-hotel transfers",
        "Address-to-address delivery",
        "Multi-city routing",
        "Scheduled pickups",
        "Short-term storage options",
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
