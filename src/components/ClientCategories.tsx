import { BriefcaseBusiness, Plane, UsersRound } from "lucide-react";

export default function ClientCategories() {
  const categories = [
    {
      title: "Business Travelers",
      description:
        "Your time is money. We collect your bags at your door and move them to the airport, so you arrive hands-free with nothing to drag.",
      icon: (
        <BriefcaseBusiness className="w-8 h-8" strokeWidth={1.5} />
      ),
    },
    {
      title: "Families",
      description:
        "Traveling with kids and 6 bags? Let us handle the luggage. You handle the memories.",
      icon: (
        <UsersRound className="w-8 h-8" strokeWidth={1.5} />
      ),
    },
    {
      title: "Frequent Flyers",
      description:
        "You already know the airport routine. Travelyt takes the suitcase drag out of it, from pickup to airline handoff.",
      icon: (
        <Plane className="w-8 h-8" strokeWidth={1.5} />
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
          <p className="text-navy/70 max-w-2xl mx-auto">
            Whether it&apos;s a quick business trip or a family vacation, your travel day starts lighter.
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
              <p className="text-sm text-navy/70 leading-relaxed">{category.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
