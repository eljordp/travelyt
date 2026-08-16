import Link from "next/link";
import DriverChrome from "@/components/DriverChrome";

const modules = [
  {
    title: "1. Use only your own credential and assigned job",
    points: [
      "Never share a driver access code or work under another person's identity.",
      "Confirm the booking, bag count, route, and assigned role before starting.",
      "If the app, assignment, or identity does not match, stop and contact operations.",
    ],
  },
  {
    title: "2. Verify before custody begins",
    points: [
      "Follow the app's identity and restricted-items checks before touching the bag.",
      "Do not copy, message, or retain private ID information outside Travelyt's approved system.",
      "Do not accept a bag when required declarations, consent, or identity review are incomplete.",
    ],
  },
  {
    title: "3. Seal and identify every bag",
    points: [
      "Use the numbered tamper-evident seal assigned for the run.",
      "Enter the exact seal number and capture a clear seal-and-bag photo with GPS.",
      "Never substitute a seal without opening an exception and recording why.",
    ],
  },
  {
    title: "4. Record every custody checkpoint",
    points: [
      "Use the driver portal to record route start, arrival, pickup, transit, handoff, and delivery events.",
      "Capture the required timestamp, GPS, photo, bag ID, seal status, and notes at the actual event.",
      "Never backfill or invent a custody event that did not happen.",
    ],
  },
  {
    title: "5. Travelyt does not perform airline screening",
    points: [
      "Do not open, search, screen, tag, or clear a passenger bag for an airline.",
      "Do not enter secure or badge-controlled airport areas unless separately authorized.",
      "For an unapproved airline handoff, return the sealed bag to the verified ticketed traveler at the public terminal point.",
    ],
  },
  {
    title: "6. Record the real receiving party",
    points: [
      "At every transfer, record who released the bag, who accepted it, when, where, and the seal condition.",
      "For an authorized recipient, record the person's name, role, organization, and acceptance reference.",
      "Do not claim airline acceptance unless a named authorized receiver actually accepts the bag.",
    ],
  },
  {
    title: "7. Stop safely when anything is wrong",
    points: [
      "Stop and open an exception for a broken or mismatched seal, wrong bag, identity mismatch, prohibited-item concern, missing recipient, vehicle issue, or unsafe delay.",
      "Keep the bag controlled and follow operations instructions; do not improvise a handoff.",
      "If custody has not begun and the run cannot be completed safely, do not accept the bag.",
    ],
  },
];

export default function DriverTrainingPage() {
  return (
    <DriverChrome title="Driver training">
      <div className="space-y-5 print:space-y-3">
        <header className="rounded-2xl bg-white p-6 shadow-sm shadow-navy/5 print:shadow-none">
          <p className="text-xs font-bold uppercase tracking-wider text-[#ff6868]">Travelyt foundational driver training · Version 1 · August 2026</p>
          <h1 className="mt-2 text-2xl font-bold text-navy">Custody, seal, scan, and handoff checklist</h1>
          <p className="mt-3 text-sm leading-relaxed text-navy/65">
            Read every module, check each box on a printed or saved copy, sign the acknowledgment, then upload it as Training evidence through your private onboarding link.
          </p>
          <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-900">
            This foundational checklist does not authorize airline acceptance, certify insurance, replace a background check, or replace an observed physical drill. Live customer custody remains blocked until operations clears every readiness item.
          </div>
        </header>

        {modules.map((module) => (
          <section key={module.title} className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 print:break-inside-avoid print:border print:border-gray-200 print:shadow-none">
            <h2 className="font-bold text-navy">{module.title}</h2>
            <div className="mt-3 space-y-2">
              {module.points.map((point) => (
                <p key={point} className="flex items-start gap-3 text-sm leading-relaxed text-navy/70">
                  <span aria-hidden="true" className="mt-0.5 inline-block h-4 w-4 shrink-0 border border-navy/40 bg-white" />
                  <span>{point}</span>
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 print:break-inside-avoid print:border print:border-gray-200 print:shadow-none">
          <h2 className="font-bold text-navy">Driver acknowledgment</h2>
          <p className="mt-2 text-sm leading-relaxed text-navy/70">
            I reviewed the Travelyt foundational driver training above. I will use only my assigned credential, record custody events truthfully, protect private information, stop on exceptions, and never claim screening or airline acceptance that did not occur.
          </p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div className="border-b border-navy/40 pb-1 text-xs text-navy/50">Printed legal name</div>
            <div className="border-b border-navy/40 pb-1 text-xs text-navy/50">Signature</div>
            <div className="border-b border-navy/40 pb-1 text-xs text-navy/50">Date and time</div>
            <div className="border-b border-navy/40 pb-1 text-xs text-navy/50">Observed drill reviewer, if completed</div>
          </div>
        </section>

        <div className="rounded-2xl bg-navy p-5 text-sm text-white print:hidden">
          Use your browser&apos;s Print command and choose Save as PDF. Sign the saved or printed checklist, then return to your private onboarding link and upload it under Training evidence.
          <div className="mt-3">
            <Link href="/driver" className="font-bold text-[#ff9b9b] underline">Return to driver portal</Link>
          </div>
        </div>
      </div>
    </DriverChrome>
  );
}
