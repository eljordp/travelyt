"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FAQ from "@/components/FAQ";
import LeadCapture from "@/components/LeadCapture";
import { APP_STORE_URL, SITE_MOTTO } from "@/lib/site";
import heroPhoto from "../../public/journey/hero-realistic-v2.webp";
import pickupPhoto from "../../public/journey/pickup-realistic-v2.webp";
import sealPhoto from "../../public/journey/seal-realistic-v2.webp";
import airportPhoto from "../../public/journey/airport-realistic-v2.webp";
import styles from "./WebsiteHome.module.css";

const journey = [
  {
    image: pickupPhoto,
    alt: "A luggage agent collecting navy suitcases from a family at their front door",
    title: "Hand over your bags at home.",
    body: "Your agent checks your trip details and matches each suitcase to you before pickup.",
  },
  {
    image: sealPhoto,
    alt: "A luggage agent attaching a tamper-evident seal to a navy suitcase",
    title: "We check, weigh and seal them.",
    body: "Each bag gets a condition record, a recorded weight and its own numbered seal.",
  },
  {
    image: airportPhoto,
    alt: "The family walking toward the airport gates carrying only personal items",
    title: "Head to the airport lighter.",
    body: "Your bags follow the confirmed handoff plan. You go through passenger screening as usual.",
  },
];

const checkpoints = [
  { title: "Pickup", detail: "Traveler, flight and bags matched" },
  { title: "Seal", detail: "Condition, weight and seal recorded" },
  { title: "Transit", detail: "Handler, time and location logged" },
  { title: "Handoff", detail: "Approved recipient and acceptance recorded" },
];

function JourneyPhoto({ src, alt, hero = false }: { src: StaticImageData; alt: string; hero?: boolean }) {
  const [original, setOriginal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`${styles.imageShell} ${loaded ? styles.imageLoaded : ""}`}>
      {!loaded && !failed && <span className={styles.loadingLabel} role="status">Loading photograph…</span>}
      {failed ? (
        <p className={styles.photoFallback}>This photo couldn’t load. The journey continues below.</p>
      ) : (
        <Image
          src={src} alt={alt} fill preload={hero} placeholder="blur"
          sizes={hero ? "(min-width: 1280px) 680px, (min-width: 800px) 55vw, 100vw" : "(min-width: 1280px) 390px, (min-width: 800px) 33vw, 100vw"}
          className={styles.photoImage} unoptimized={original}
          onLoad={() => setLoaded(true)}
          onError={() => original ? setFailed(true) : setOriginal(true)}
        />
      )}
    </div>
  );
}

export default function WebsiteHome() {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add(styles.revealed);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    mainRef.current?.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.site}>
      <Navbar />
      <main ref={mainRef} className={styles.main}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroHeading} data-reveal>
            <p className={styles.eyebrow}>{SITE_MOTTO}</p>
            <h1 id="home-title">Your bags leave home.<br /><span>You travel lighter.</span></h1>
          </div>
          <figure className={styles.heroPhoto}>
            <div className={styles.heroFrame}>
              <JourneyPhoto src={heroPhoto} alt="A family enjoying a quiet moment together by the airport windows with only personal bags" hero />
            </div>
            <figcaption>Illustrative concept · A lighter airport day</figcaption>
          </figure>
          <div className={styles.heroDetails}>
            <p className={styles.description}>We’re preparing to collect your checked bags at home, so you have less to carry on the way to your flight.</p>
            <div className={styles.actions}>
              <Link href="#route-updates" className={styles.button}>Join the launch <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link href="#journey" className={styles.textLink}>See how it works <span aria-hidden="true">↓</span></Link>
            </div>
            <p className={styles.launchNote}><span aria-hidden="true" /> Launching market by market. We confirm every route.</p>
          </div>
        </section>

        <section id="journey" className={styles.journey} aria-labelledby="journey-title">
          <div className={styles.sectionHeading} data-reveal>
            <div><p className={styles.eyebrow}>From your door to departure</p><h2 id="journey-title">One less thing to carry.</h2></div>
            <p>A pickup at home starts the plan.<br />Here’s what happens next.</p>
          </div>
          <div className={styles.familyStory}>
            {journey.map((step, index) => (
              <figure key={step.title} data-reveal>
                <div className={styles.storyPhoto}><JourneyPhoto src={step.image} alt={step.alt} /></div>
                <figcaption>
                  <span className={styles.stepNumber}>0{index + 1}</span>
                  <h3>{step.title}</h3><p>{step.body}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className={styles.imageNote}>Images illustrate the proposed service.</p>
        </section>

        <section className={styles.custody} aria-labelledby="custody-title">
          <div className={styles.custodyInner}>
            <div className={styles.sectionHeading} data-reveal>
              <div><p className={styles.eyebrow}>Chain of custody</p><h2 id="custody-title">Your bag has a record.<br />Every handoff adds to it.</h2></div>
              <p>Who handled it. Where it went. When it arrived.<br />The details stay attached to each bag.</p>
            </div>
            <ol className={styles.checkpoints} aria-label="Bag custody checkpoints">
              {checkpoints.map((point, index) => <li key={point.title} data-reveal><span className={styles.checkpointNumber}>0{index + 1}</span><h3>{point.title}</h3><p>{point.detail}</p></li>)}
            </ol>
            <div className={styles.custodyDetails}>
              <div data-reveal><h3>See the recorded progress.</h3><p>Custody milestones show your bag’s progress without exposing private traveler details. Continuous live GPS is not yet available.</p></div>
              <div data-reveal><h3>If something is wrong, we pause.</h3><p>A damaged seal, refused handoff or missed cutoff stops the transfer and triggers review.</p></div>
            </div>
            <div className={styles.passengerPath}>
              <span>Your path</span><p>Home <ArrowRight aria-hidden="true" size={14} /> Passenger screening <ArrowRight aria-hidden="true" size={14} /> Gate</p>
              <p>At your destination, collect your bags at normal baggage claim on the proposed airline handoff route.</p>
            </div>
            <div className={styles.handoffNote}>
              <p>Direct airline handoff requires authorization from the carrier and airport station. We confirm availability, timing and the exact handoff plan before a service booking. Normal passenger screening still applies.</p>
              <Link href="/trust" className={styles.textLink}>More about custody and trust <ArrowRight size={17} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        <section id="route-updates" className={styles.signup} aria-labelledby="launch-title">
          <div data-reveal><p className={styles.eyebrow}>Be there for the launch</p><h2 id="launch-title">Where are you<br />headed next?</h2><p>Join the list for route and launch updates.<br />We’ll confirm availability with you directly.</p></div>
          <div className={styles.signupForm}><LeadCapture source="homepage-seamless-launch" defaultInterest="family-trip" /><a href={APP_STORE_URL} target="_blank" rel="noreferrer" className={styles.textLink}>You can also find us on the App Store <ArrowRight size={17} aria-hidden="true" /></a></div>
        </section>
        <div className={styles.faq}><FAQ /></div>
      </main>
      <Footer />
    </div>
  );
}
