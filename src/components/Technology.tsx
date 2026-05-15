import { ClipboardCheck, Lightbulb, LockKeyhole, MapPin, Smartphone, Zap } from "lucide-react";

export default function Technology() {
  const features = [
    {
      title: "Live Bag Tracking",
      description:
        "A GPS-enabled tag and a shareable tracking link. Watch your luggage move from your door to your destination in real time.",
      icon: (
        <MapPin className="w-6 h-6" strokeWidth={1.5} />
      ),
    },
    {
      title: "Tamper-Evident Seals",
      description:
        "Every bag is sealed at pickup with a uniquely numbered seal. Any break is logged and flagged instantly — you know if anything changes hands unexpectedly.",
      icon: (
        <LockKeyhole className="w-6 h-6" strokeWidth={1.5} />
      ),
    },
    {
      title: "Digital Chain of Custody",
      description:
        "Every handoff is logged with timestamp, location, and operator ID. Full digital audit trail from pickup to delivery.",
      icon: (
        <ClipboardCheck className="w-6 h-6" strokeWidth={1.5} />
      ),
    },
    {
      title: "Smart Booking Platform",
      description:
        "Book a pickup, manage your itinerary, and get SMS and email updates at every checkpoint — from a simple, fast web experience.",
      icon: (
        <Smartphone className="w-6 h-6" strokeWidth={1.5} />
      ),
    },
    {
      title: "Operator Dispatch",
      description:
        "Routing and scheduling tools keep drivers on time and bags on-route — so pickups and deliveries land in the window we promised.",
      icon: (
        <Lightbulb className="w-6 h-6" strokeWidth={1.5} />
      ),
    },
    {
      title: "Last-Mile Network",
      description:
        "A focused delivery network for the final leg — residences, hotel lobbies, serviced apartments, and pickup points.",
      icon: (
        <Zap className="w-6 h-6" strokeWidth={1.5} />
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
          <p className="text-navy/70 max-w-2xl mx-auto">
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
              <p className="text-sm text-navy/70 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
