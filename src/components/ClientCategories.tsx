export default function ClientCategories() {
  const categories = [
    {
      title: "Business Travelers",
      description:
        "Your time is money. We collect your bags, check them in, and have them at your destination. You walk straight to the gate.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: "Families",
      description:
        "Traveling with kids and 6 bags? Let us handle the luggage. You handle the memories.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: "Frequent Flyers",
      description:
        "You've done this a hundred times. Now do it without ever touching your bags at the airport.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      ),
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            Who We Serve
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Built for how you travel
          </h2>
          <p className="text-navy/60 max-w-2xl mx-auto">
            Whether it&apos;s a quick business trip or a family vacation, your bags are in good hands.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {categories.map((category) => (
            <div key={category.title}
              className="group rounded-2xl border border-gray-100 p-8 hover:border-navy/20 hover:shadow-lg hover:shadow-navy/5 transition-all duration-300">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-navy/10 to-purple/10 flex items-center justify-center text-navy mb-5 group-hover:from-navy/20 group-hover:to-purple/20 transition-colors">
                {category.icon}
              </div>
              <h3 className="text-xl font-bold text-navy mb-3">{category.title}</h3>
              <p className="text-sm text-navy/60 leading-relaxed">{category.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
