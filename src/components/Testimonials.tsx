export default function Testimonials() {
  const reviews = [
    {
      name: "Sarah M.",
      role: "Frequent Flyer",
      text: "Travelyt changed how I travel. I walked straight to my gate in 10 minutes. No lines, no carousel wait. Just freedom.",
      rating: 5,
    },
    {
      name: "David K.",
      role: "Business Traveler",
      text: "The doorstep check-in is a game changer for business trips. My bags were tagged and gone before my morning coffee was cold.",
      rating: 5,
    },
    {
      name: "Priya R.",
      role: "Family Traveler",
      text: "Traveling with three kids and six bags used to be a nightmare. Travelyt picked everything up and we just showed up at the airport. Life changing.",
      rating: 5,
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-blue-light">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            Testimonials
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Loved by travelers worldwide
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((review) => (
            <div
              key={review.name}
              className="bg-white rounded-2xl p-8 shadow-lg shadow-navy/5"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: review.rating }).map((_, i) => (
                  <svg
                    key={i}
                    className="w-5 h-5 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <p className="text-navy/70 leading-relaxed mb-6 text-sm">
                &ldquo;{review.text}&rdquo;
              </p>

              <div>
                <div className="font-bold text-navy">{review.name}</div>
                <div className="text-xs text-navy/40">{review.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
