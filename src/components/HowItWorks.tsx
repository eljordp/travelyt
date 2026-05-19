import { Check, Map, MapPin, Monitor } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Book Online",
      description:
        "Enter your pickup address, destination, travel date, and number of bags. Get an instant quote.",
      icon: (
        <Monitor className="w-8 h-8" strokeWidth={1.5} />
      ),
    },
    {
      step: "02",
      title: "We Collect",
      description:
        "A vetted Travelyt agent arrives at your door at the scheduled time. Bags weighed, tagged, and sealed on the spot.",
      icon: (
        <MapPin className="w-8 h-8" strokeWidth={1.5} />
      ),
    },
    {
      step: "03",
      title: "We Deliver to Your Airline",
      description:
        "Your bag is driven straight to the airport and handed to TSA security for your flight. No counter, no shipping — your luggage goes on your plane.",
      icon: (
        <Map className="w-8 h-8" strokeWidth={1.5} />
      ),
    },
    {
      step: "04",
      title: "Arrive Free",
      description:
        "Walk through the airport hands-free. Your bag is already on your flight — or for arrivals, already on its way to your address.",
      icon: (
        <Check className="w-8 h-8" strokeWidth={1.5} />
      ),
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-navy text-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-white uppercase tracking-wider">
            Simple Process
          </span>
          <h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">
            How Travelyt Works
          </h2>
          <p className="text-white/60 max-w-2xl mx-auto">
            Four simple steps between you and stress-free travel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={step.step} className="relative">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[calc(50%+2rem)] right-[calc(-50%+2rem)] h-px bg-gradient-to-r from-cyan/40 to-transparent" />
              )}

              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 text-white">
                  {step.icon}
                </div>
                <div className="text-xs font-bold text-white tracking-wider mb-2">
                  STEP {step.step}
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
