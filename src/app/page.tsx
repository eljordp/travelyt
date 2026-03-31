import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ClientCategories from "@/components/ClientCategories";
import Services from "@/components/Services";
import HowItWorks from "@/components/HowItWorks";
import Stats from "@/components/Stats";
import Technology from "@/components/Technology";
import Sustainability from "@/components/Sustainability";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <ClientCategories />
      <Services />
      <HowItWorks />
      <Stats />
      <Technology />
      <Sustainability />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </>
  );
}
