export default function CTA() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-r from-purple to-purple-light text-white relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-6">
          Ready to travel differently?
        </h2>
        <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Join thousands of travelers who&apos;ve ditched the airport chaos. Book
          your first Travelyt experience today.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#book"
            className="bg-white text-purple px-8 py-4 rounded-full font-bold text-lg hover:bg-white/90 transition-colors"
          >
            Book Now
          </a>
          <a
            href="#how-it-works"
            className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white/10 transition-colors"
          >
            Learn More
          </a>
        </div>
      </div>
    </section>
  );
}
