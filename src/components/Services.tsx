import Image from "next/image";
import { CircleCheck } from "lucide-react";

export default function Services() {
  const services = [
    {
      label: "Departures",
      title: "Doorstep-to-Airline",
      description:
        "We pick up your luggage at your door, weigh and seal every bag, and deliver it straight to your airline at the airport. You arrive hands-free — ready to walk on with nothing to lug.",
      features: [
        "Scheduled doorstep pickup",
        "Weighing and tamper-proof sealing",
        "Airline-compliant bag prep",
        "Direct delivery to your airline",
        "Live GPS tracking",
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
          <p className="text-navy/70 max-w-2xl mx-auto">
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
                <div className="relative rounded-3xl overflow-hidden aspect-[4/3]">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1">
                <span
                  className="inline-block text-xs font-bold uppercase tracking-wider text-purple mb-3"
                >
                  {service.label}
                </span>
                <h3 className="text-2xl md:text-4xl font-bold text-navy mb-4">
                  {service.title}
                </h3>
                <p className="text-navy/70 leading-relaxed mb-6">
                  {service.description}
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-navy/70">
                      <CircleCheck
                        className="w-4 h-4 text-purple flex-shrink-0"
                        fill="currentColor"
                        strokeWidth={1.5}
                      />
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
