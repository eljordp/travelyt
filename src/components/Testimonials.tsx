import Link from "next/link";

export default function Testimonials() {
  const promises = [
    {
      title: "We move your bags. You move freely.",
      body: "One job, done well. You hand us your bags at your door; we get them where they need to be. No upsells, no bolt-ons, no nickel-and-diming.",
    },
    {
      title: "Honest about what we do",
      body: "We're not an airline. We don't check bags in on your behalf at the counter. We're a purpose-built baggage courier — and we'll only promise what we can actually deliver.",
    },
    {
      title: "Built with the traveler in mind",
      body: "Designed around real friction: the walk to the car with three suitcases, the taxi with the kids and the stroller, the long shuffle through the terminal. We remove that.",
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-blue-light">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            Our Promise
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Building this the right way
          </h2>
          <p className="text-navy/60 max-w-2xl mx-auto">
            Travelyt is early-stage. We&apos;re onboarding partners and launch customers now — and we&apos;re committed to being straight with both.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {promises.map((p) => (
            <div
              key={p.title}
              className="bg-white rounded-2xl p-8 shadow-lg shadow-navy/5"
            >
              <h3 className="text-lg font-bold text-navy mb-3">{p.title}</h3>
              <p className="text-navy/60 leading-relaxed text-sm">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            href="/quote"
            className="inline-block bg-navy text-white px-8 py-4 rounded-full font-semibold hover:bg-navy/90 transition-colors"
          >
            Request a quote
          </Link>
        </div>
      </div>
    </section>
  );
}
