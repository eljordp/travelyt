#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadDotEnv(path.join(repoRoot, ".env.local"));

const ACTIVE_STATUSES = [
  "paid",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
  "issue",
];

const STATUS_LABELS = {
  pending: "Quote request received",
  paid: "Paid - ready for dispatch",
  assigned: "Driver assigned",
  accepted: "Driver accepted",
  en_route: "Driver en route",
  arrived: "Driver arrived",
  picked_up: "Bags picked up",
  in_transit: "In transit / airline accepted",
  delivery_pending: "Delivery pending customer confirmation",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
  issue: "Issue / failed",
};

const SERVICE_LABELS = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};

const FAILURE_PLAYBOOKS = [
  {
    title: "Customer app or tracking link down",
    owner: "Admin / dispatcher",
    firstCheck: "Confirm the booking is visible in the emergency kit and copy the customer phone/email.",
    steps: [
      "Text or call the customer with the current booking status.",
      "Send proof photos manually if the customer cannot open tracking.",
      "Record customer approval or dispute in the manual incident log.",
      "Keep the driver moving only when custody approval is clear.",
    ],
  },
  {
    title: "Driver portal down",
    owner: "Dispatcher",
    firstCheck: "Open the booking run sheet and confirm driver assignment, pickup address, flight, and customer phone.",
    steps: [
      "Send the driver the run sheet details by text.",
      "Ask for live location share or GPS screenshot at route start and arrival.",
      "Ask for bag/seal and handoff photos by text.",
      "Record each received proof in the manual incident log with time and seal ID.",
    ],
  },
  {
    title: "Admin portal down",
    owner: "Backup ops lead",
    firstCheck: "Use this static export as the command surface and work active bookings by travel time.",
    steps: [
      "Open the active booking list and sort by travel time.",
      "Work one run sheet at a time.",
      "Use manual notes instead of normal admin status controls.",
      "Regenerate the export once the app/database returns so a fresh copy exists.",
    ],
  },
  {
    title: "Stripe checkout or payment uncertainty",
    owner: "Finance / admin",
    firstCheck: "Check Stripe dashboard for payment intent, checkout session, refund, or failed payment status.",
    steps: [
      "Do not begin custody if payment is unknown unless admin approves a manual exception.",
      "Send a manual Stripe payment link if app checkout fails.",
      "Record payment status and Stripe reference in the manual incident log.",
      "Refund or cancel from Stripe if service cannot be performed.",
    ],
  },
  {
    title: "GPS or photo upload fails",
    owner: "Driver plus dispatcher",
    firstCheck: "Confirm the driver can send text photos and a location screenshot.",
    steps: [
      "Driver sends bag/seal photo by text.",
      "Driver sends current map location or live location share.",
      "Dispatcher records the fallback proof in the manual incident log.",
      "When the normal app returns, admin reconciles proof into the booking record.",
    ],
  },
  {
    title: "Database or hosting issue",
    owner: "Technical admin",
    firstCheck: "Use the latest exported run sheets and CSV while diagnosing Vercel/Supabase.",
    steps: [
      "Freeze nonessential changes until the data path is known.",
      "Operate active jobs by phone/text from the latest export.",
      "Record new updates in a local shared note until the database returns.",
      "Reconcile every manual update back into Backup Ops once service is restored.",
    ],
  },
  {
    title: "Airline or airport refuses handoff",
    owner: "Dispatcher",
    firstCheck: "Collect the receiving party name, organization, counter, and reason for refusal.",
    steps: [
      "Driver stays with bags until dispatcher gives instructions.",
      "Record refusal details and any badge/reference in the manual incident log.",
      "Call customer with options: wait, redirect, cancel, or return bags.",
      "Escalate refund/claim decision if custody cannot continue.",
    ],
  },
];

const outputRoot = path.resolve(repoRoot, process.env.BACKUP_OPS_OUTPUT_DIR || "ops-backups");
const appBaseUrl = stripTrailingSlash(process.env.BACKUP_OPS_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travelyt.us");
const timezone = process.env.BACKUP_OPS_TZ || "America/Los_Angeles";

main().catch((error) => {
  console.error(`Backup export failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("travel_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const bookings = (data ?? [])
    .filter((booking) => !booking.archived_at && ACTIVE_STATUSES.includes(booking.status))
    .map(normalizeBooking);

  const generatedAt = new Date();
  const stamp = generatedAt.toISOString().replace(/[:.]/g, "-");
  const stampDir = path.join(outputRoot, stamp);
  const latestDir = path.join(outputRoot, "latest");

  writeKit(stampDir, bookings, generatedAt);
  rmSync(latestDir, { recursive: true, force: true });
  writeKit(latestDir, bookings, generatedAt);

  const jsonPath = path.join(latestDir, "travelyt-active-bookings.json");
  const digest = createHash("sha256").update(readFileSync(jsonPath)).digest("hex").slice(0, 16);

  console.log("Backup Ops kit generated");
  console.log(`Generated: ${formatDateTime(generatedAt.toISOString())}`);
  console.log(`Active bookings: ${bookings.length}`);
  console.log(`Latest kit: ${path.relative(repoRoot, path.join(latestDir, "index.html"))}`);
  console.log(`CSV: ${path.relative(repoRoot, path.join(latestDir, "travelyt-active-bookings.csv"))}`);
  console.log(`JSON digest: ${digest}`);
  console.log("Reminder: ops-backups/ contains PII and is intentionally gitignored.");
}

function writeKit(dir, bookings, generatedAt) {
  const bookingDir = path.join(dir, "bookings");
  mkdirSync(bookingDir, { recursive: true });

  const manifest = {
    generatedAt: generatedAt.toISOString(),
    timezone,
    activeBookingCount: bookings.length,
    source: "Supabase bookings table",
    appBaseUrl,
  };

  writeFileSync(path.join(dir, "index.html"), renderIndex(bookings, generatedAt), "utf8");
  writeFileSync(path.join(dir, "playbook.html"), renderPlaybook(generatedAt), "utf8");
  writeFileSync(path.join(dir, "travelyt-active-bookings.csv"), renderCsv(bookings), "utf8");
  writeFileSync(path.join(dir, "travelyt-active-bookings.json"), JSON.stringify(bookings, null, 2), "utf8");
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(path.join(dir, "README.txt"), renderReadme(generatedAt, bookings.length), "utf8");

  for (const booking of bookings) {
    writeFileSync(
      path.join(bookingDir, `${safeFileName(booking.id)}.html`),
      renderBooking(booking, generatedAt),
      "utf8"
    );
  }
}

function renderIndex(bookings, generatedAt) {
  const cards = bookings.length
    ? bookings.map(renderBookingCard).join("\n")
    : `<section class="empty">No active bookings were present when this kit was generated.</section>`;

  return pageShell({
    title: "Travelyt Emergency Ops",
    eyebrow: "Static backup kit",
    generatedAt,
    body: `
      <section class="hero">
        <div>
          <p class="kicker">Emergency command surface</p>
          <h1>Active booking run sheets</h1>
          <p>This packet works without the Travelyt app UI. Use it when the customer app, driver portal, admin portal, hosting, or database path is degraded.</p>
        </div>
        <div class="hero-card">
          <strong>${bookings.length}</strong>
          <span>active bookings</span>
          <a href="travelyt-active-bookings.csv">Download CSV</a>
          <a href="playbook.html">Open failure playbook</a>
        </div>
      </section>
      <section class="warning">
        <strong>Sensitive data.</strong> This export contains customer contact details, addresses, tracking links, proof metadata, and job notes. Keep it behind access control and do not commit it.
      </section>
      <section class="booking-grid">
        ${cards}
      </section>
    `,
  });
}

function renderBookingCard(booking) {
  const statusClass = booking.status === "issue" ? "danger" : "status";
  return `
    <article class="booking-card">
      <div class="card-head">
        <div>
          <h2>${escapeHtml(booking.id)}</h2>
          <p>${escapeHtml(booking.name || "Unnamed customer")}</p>
        </div>
        <span class="${statusClass}">${escapeHtml(statusLabel(booking.status))}</span>
      </div>
      <dl>
        <div><dt>Service</dt><dd>${escapeHtml(serviceLabel(booking.service))}</dd></div>
        <div><dt>Airport</dt><dd>${escapeHtml(booking.airport || "Not set")}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(booking.travelDate || "Not set")} ${escapeHtml(booking.flightTime || "")}</dd></div>
        <div><dt>Driver</dt><dd>${escapeHtml(booking.driverName || "Unassigned")}</dd></div>
        <div><dt>Next</dt><dd>${escapeHtml(nextAction(booking))}</dd></div>
      </dl>
      <a class="primary-link" href="bookings/${safeFileName(booking.id)}.html">Open run sheet</a>
    </article>
  `;
}

function renderBooking(booking, generatedAt) {
  const proofs = booking.proofs.length
    ? booking.proofs.map(renderProof).join("\n")
    : `<p class="muted">No app proof records in this export.</p>`;

  const locations = booking.locationEvents.length
    ? booking.locationEvents.map(renderLocation).join("\n")
    : `<p class="muted">No GPS events in this export.</p>`;

  const history = booking.statusHistory.length
    ? booking.statusHistory.map(renderHistory).join("\n")
    : `<p class="muted">No status history in this export.</p>`;

  return pageShell({
    title: `${booking.id} Run Sheet`,
    eyebrow: "Emergency run sheet",
    generatedAt,
    body: `
      <section class="nav-row"><a href="../index.html">Back to active bookings</a><a href="../playbook.html">Failure playbook</a><a href="../travelyt-active-bookings.csv">CSV</a></section>
      <section class="hero">
        <div>
          <p class="kicker">${escapeHtml(serviceLabel(booking.service))}</p>
          <h1>${escapeHtml(booking.id)}</h1>
          <p>${escapeHtml(nextAction(booking))}</p>
        </div>
        <div class="hero-card">
          <strong>${escapeHtml(statusLabel(booking.status))}</strong>
          <span>${escapeHtml(booking.driverName || "No driver assigned")}</span>
          <a href="${escapeAttr(trackingUrl(booking))}">Customer tracking link</a>
          <a href="${escapeAttr(mapsUrl(booking.address))}">Open pickup map</a>
        </div>
      </section>

      <section class="two-col">
        <article class="panel">
          <h2>Customer</h2>
          ${detailRow("Name", booking.name)}
          ${detailRow("Phone", booking.phone)}
          ${detailRow("Email", booking.email)}
          ${detailRow("Tracking", trackingUrl(booking))}
          ${detailRow("Confirmation code", booking.deliveryConfirmationCode)}
        </article>
        <article class="panel">
          <h2>Trip</h2>
          ${detailRow("Service", serviceLabel(booking.service))}
          ${detailRow("Airport", booking.airport)}
          ${detailRow("Address", booking.address)}
          ${detailRow("Travel date", booking.travelDate)}
          ${detailRow("Flight time", booking.flightTime)}
          ${detailRow("Flight", booking.flight)}
          ${detailRow("Bags", booking.bags)}
          ${detailRow("Price", money(booking.priceCents))}
          ${detailRow("Paid at", formatDateTime(booking.paidAt))}
        </article>
      </section>

      <section class="panel">
        <h2>Manual fallback instructions</h2>
        <ol>
          <li>Call or text the customer before custody changes if the live app is unavailable.</li>
          <li>Confirm driver, address, flight, bag count, and seal ID before pickup.</li>
          <li>Ask the driver for GPS screenshot/live location if the portal cannot record location.</li>
          <li>Ask the driver for bag/seal/handoff photos by text if app upload fails.</li>
          <li>Write every manual update in a shared incident note, then reconcile it into Travelyt when systems recover.</li>
        </ol>
      </section>

      <section class="panel">
        <h2>Notes</h2>
        <p>${escapeHtml(booking.notes || "No customer notes.")}</p>
      </section>

      <section class="panel">
        <h2>Proofs</h2>
        <div class="proof-grid">${proofs}</div>
      </section>

      <section class="panel">
        <h2>Location trail</h2>
        <div class="timeline">${locations}</div>
      </section>

      <section class="panel">
        <h2>Status history</h2>
        <div class="timeline">${history}</div>
      </section>
    `,
  });
}

function renderProof(proof) {
  const image = proof.dataUrl
    ? `<img src="${escapeAttr(proof.dataUrl)}" alt="${escapeAttr(proof.kind)} proof">`
    : "";
  const location = proof.location
    ? `<a href="${escapeAttr(mapPointUrl(proof.location.latitude, proof.location.longitude))}">Open proof GPS</a>`
    : "";
  const handoff = proof.handoff
    ? `<p><strong>Handoff:</strong> ${escapeHtml(proof.handoff.recipientName || "")} / ${escapeHtml(proof.handoff.organization || "")}</p>`
    : "";

  return `
    <article class="proof">
      ${image}
      <h3>${escapeHtml((proof.kind || "proof").replaceAll("_", " "))}</h3>
      <p>${escapeHtml(formatDateTime(proof.timestamp))}</p>
      ${detailRow("Seal", proof.sealId)}
      ${detailRow("Driver", proof.driverName)}
      ${detailRow("Note", proof.note)}
      ${handoff}
      ${location}
    </article>
  `;
}

function renderLocation(event) {
  const accuracy = typeof event.accuracyMeters === "number" ? ` / ${Math.round(event.accuracyMeters)}m` : "";
  return `
    <article class="timeline-item">
      <h3>${escapeHtml(event.label || event.kind || "Location event")}</h3>
      <p>${escapeHtml(formatDateTime(event.capturedAt))} ${escapeHtml(event.actorName || "")}</p>
      <p>${escapeHtml(event.latitude)}, ${escapeHtml(event.longitude)}${escapeHtml(accuracy)}</p>
      ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
      <a href="${escapeAttr(mapPointUrl(event.latitude, event.longitude))}">Open map point</a>
    </article>
  `;
}

function renderHistory(entry) {
  return `
    <article class="timeline-item">
      <h3>${escapeHtml((entry.action || "history").replaceAll("_", " "))}</h3>
      <p>${escapeHtml(formatDateTime(entry.timestamp))} ${escapeHtml(entry.actorRole || "")} ${escapeHtml(entry.actorName || "")}</p>
      <p>${escapeHtml(entry.fromStatus || "")}${entry.toStatus ? ` -> ${escapeHtml(entry.toStatus)}` : ""}</p>
      ${entry.reason ? `<p>${escapeHtml(entry.reason)}</p>` : ""}
    </article>
  `;
}

function renderPlaybook(generatedAt) {
  return pageShell({
    title: "Travelyt Failure Playbook",
    eyebrow: "Emergency playbook",
    generatedAt,
    body: `
      <section class="nav-row"><a href="index.html">Back to active bookings</a><a href="travelyt-active-bookings.csv">CSV</a></section>
      <section class="hero">
        <div>
          <p class="kicker">A-to-Z fallback</p>
          <h1>Operate by run sheet, phone, text, and proof logs</h1>
          <p>If a system dies, do not let the business die with it. Move one booking at a time and reconcile after recovery.</p>
        </div>
      </section>
      <section class="playbooks">
        ${FAILURE_PLAYBOOKS.map(renderPlaybookCard).join("\n")}
      </section>
    `,
  });
}

function renderPlaybookCard(playbook) {
  return `
    <article class="panel">
      <p class="kicker">${escapeHtml(playbook.owner)}</p>
      <h2>${escapeHtml(playbook.title)}</h2>
      <p><strong>First check:</strong> ${escapeHtml(playbook.firstCheck)}</p>
      <ol>${playbook.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    </article>
  `;
}

function renderCsv(bookings) {
  const header = [
    "booking_id",
    "status",
    "service",
    "airport",
    "travel_date",
    "flight_time",
    "flight",
    "bags",
    "price",
    "paid_at",
    "customer",
    "customer_phone",
    "customer_email",
    "address",
    "driver",
    "seal_id",
    "latest_proof",
    "next_action",
    "tracking_url",
  ];

  const rows = bookings.map((booking) => [
    booking.id,
    statusLabel(booking.status),
    serviceLabel(booking.service),
    booking.airport,
    booking.travelDate,
    booking.flightTime,
    booking.flight,
    booking.bags,
    money(booking.priceCents),
    booking.paidAt,
    booking.name,
    booking.phone,
    booking.email,
    booking.address,
    booking.driverName,
    latestSealId(booking),
    latestProofSummary(booking),
    nextAction(booking),
    trackingUrl(booking),
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function renderReadme(generatedAt, count) {
  return `Travelyt Emergency Ops Kit

Generated: ${formatDateTime(generatedAt.toISOString())}
Active bookings: ${count}

This folder contains live customer/job data. Treat it as confidential.

Use:
1. Open index.html locally, or upload this entire folder to a password-protected emergency host.
2. Work active jobs from the individual run sheets in bookings/.
3. If the normal app is down, record manual status/proof/customer notes in a shared incident note.
4. When Travelyt recovers, reconcile every manual update back into the admin portal.

Do not:
- commit ops-backups/ to git
- put this folder on a public URL
- send the JSON/CSV to anyone who does not need operational access
`;
}

function pageShell({ title, eyebrow, generatedAt, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --navy: #06164b;
      --blue: #142c7a;
      --red: #ff6b6f;
      --ink: #071340;
      --muted: #687190;
      --line: #dfe3ec;
      --soft: #f4f6fb;
      --warn: #fff4d8;
      --danger: #d91f38;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--soft);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    a { color: var(--blue); font-weight: 800; }
    .topbar {
      background: var(--navy);
      color: white;
      padding: 20px min(5vw, 56px);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }
    .brand { font-size: 20px; font-weight: 900; letter-spacing: 0; }
    .generated { color: rgba(255,255,255,.72); font-size: 13px; text-align: right; }
    main { width: min(1180px, calc(100% - 32px)); margin: 28px auto 56px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 20px;
      align-items: stretch;
      margin-bottom: 20px;
    }
    .hero h1 { font-size: clamp(32px, 5vw, 56px); line-height: 1.02; margin: 6px 0 14px; }
    .hero p { color: var(--muted); font-size: 18px; max-width: 720px; }
    .hero-card, .panel, .booking-card, .warning, .empty {
      background: white;
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(7, 19, 64, .07);
    }
    .hero-card { padding: 22px; display: grid; gap: 10px; align-content: center; }
    .hero-card strong { font-size: 28px; }
    .hero-card span { color: var(--muted); font-weight: 800; }
    .hero-card a, .primary-link {
      display: inline-flex;
      width: fit-content;
      min-height: 40px;
      align-items: center;
      padding: 10px 14px;
      background: var(--red);
      color: white;
      border-radius: 7px;
      text-decoration: none;
    }
    .kicker { text-transform: uppercase; color: var(--red) !important; font-size: 13px !important; font-weight: 900; letter-spacing: .08em; margin: 0; }
    .warning { padding: 16px 18px; background: var(--warn); margin-bottom: 20px; }
    .booking-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .booking-card, .panel, .empty { padding: 20px; }
    .card-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
    h2 { margin: 0 0 8px; font-size: 22px; }
    h3 { margin: 0 0 4px; font-size: 16px; }
    p { margin: 0 0 10px; }
    .muted { color: var(--muted); }
    .status, .danger {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 6px 10px;
      border-radius: 999px;
      font-weight: 900;
      font-size: 12px;
      white-space: nowrap;
    }
    .status { background: #e5f8eb; color: #0b7d2b; }
    .danger { background: #ffe3e6; color: var(--danger); }
    dl { display: grid; gap: 10px; margin: 16px 0; }
    dt, .detail-label { color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 900; letter-spacing: .06em; }
    dd { margin: 2px 0 0; font-weight: 800; overflow-wrap: anywhere; }
    .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 20px 0; }
    .panel { margin-bottom: 16px; }
    .nav-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
    .nav-row a { background: white; border: 1px solid var(--line); border-radius: 999px; padding: 10px 14px; text-decoration: none; }
    .detail { padding: 10px 0; border-bottom: 1px solid var(--line); }
    .detail:last-child { border-bottom: 0; }
    .detail-value { font-weight: 800; overflow-wrap: anywhere; }
    .proof-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .proof, .timeline-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcff;
      overflow-wrap: anywhere;
    }
    .proof img { width: 100%; max-height: 360px; object-fit: contain; border-radius: 6px; background: #eef1f8; margin-bottom: 12px; }
    .timeline { display: grid; gap: 12px; }
    .playbooks { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
    li { margin: 8px 0; }
    @media (max-width: 780px) {
      .topbar { display: block; }
      .generated { text-align: left; margin-top: 6px; }
      .hero, .two-col { grid-template-columns: 1fr; }
      .hero h1 { font-size: 36px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div>
      <div class="brand">Travelyt Backup Ops</div>
      <div>${escapeHtml(eyebrow)}</div>
    </div>
    <div class="generated">Generated ${escapeHtml(formatDateTime(generatedAt.toISOString()))}</div>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

function normalizeBooking(row) {
  return {
    id: row.id,
    service: row.service,
    airport: row.airport ?? "",
    address: row.address ?? "",
    travelDate: row.travel_date ?? "",
    flightTime: row.flight_time ?? "",
    flight: row.flight ?? "",
    bags: row.bags ?? "",
    name: row.customer_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    status: row.status,
    priceCents: row.price_cents ?? 0,
    createdAt: row.created_at ?? "",
    paidAt: row.paid_at ?? "",
    assignedAt: row.assigned_at ?? "",
    acceptedAt: row.accepted_at ?? "",
    enRouteAt: row.en_route_at ?? "",
    arrivedAt: row.arrived_at ?? "",
    driverName: row.driver_name ?? "",
    pickedUpAt: row.picked_up_at ?? "",
    deliveryPendingAt: row.delivery_pending_at ?? "",
    deliveredAt: row.delivered_at ?? "",
    closedAt: row.closed_at ?? "",
    deliveryConfirmationCode: row.delivery_confirmation_code ?? "",
    customerConfirmedAt: row.customer_confirmed_at ?? "",
    customerSignatureName: row.customer_signature_name ?? "",
    issueType: row.issue_type ?? "",
    issueNotes: row.issue_notes ?? "",
    issueOpenedAt: row.issue_opened_at ?? "",
    issueResolvedAt: row.issue_resolved_at ?? "",
    issueResolution: row.issue_resolution ?? "",
    locationEvents: Array.isArray(row.location_events) ? row.location_events : [],
    proofs: Array.isArray(row.proofs) ? row.proofs : [],
    statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
    customerAccessToken: row.customer_access_token ?? "",
    customerUserId: row.customer_user_id ?? "",
    driverUserId: row.driver_user_id ?? "",
    externalProvider: row.external_provider ?? "",
    externalReference: row.external_reference ?? "",
    externalStatus: row.external_status ?? "",
  };
}

function nextAction(booking) {
  if (booking.status === "paid") return "Assign a driver or confirm manual fallback.";
  if (booking.status === "assigned") return "Driver must accept the assigned job.";
  if (booking.status === "accepted") return "Driver starts route and records GPS.";
  if (booking.status === "en_route") return "Driver marks arrival with GPS.";
  if (booking.status === "arrived") return "Capture seal/proof and confirm custody.";
  if (booking.status === "picked_up") {
    return booking.service === "departure"
      ? "Customer approves seal, then driver records airline handoff."
      : "Move bags to delivery or next custody step.";
  }
  if (booking.status === "in_transit") return "Complete delivery or final handoff proof.";
  if (booking.status === "delivery_pending") return "Customer confirms receipt.";
  if (booking.status === "issue") return "Keep job frozen until admin records resolution.";
  return "No active next action.";
}

function latestSealId(booking) {
  return [...booking.proofs].reverse().find((proof) => proof?.sealId)?.sealId ?? "";
}

function latestProofSummary(booking) {
  const latest = [...booking.proofs].reverse()[0];
  if (!latest) return "No app proof on file";
  const name = String(latest.kind ?? "proof").replaceAll("_", " ");
  return `${name} proof at ${formatDateTime(latest.timestamp)}`;
}

function serviceLabel(service) {
  return SERVICE_LABELS[service] || service || "Unknown";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Unknown";
}

function trackingUrl(booking) {
  const token = booking.customerAccessToken ? `?token=${encodeURIComponent(booking.customerAccessToken)}` : "";
  return `${appBaseUrl}/track/${encodeURIComponent(booking.id)}${token}`;
}

function mapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "")}`;
}

function mapPointUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function detailRow(label, value) {
  const display = value === undefined || value === null || value === "" ? "Not recorded" : String(value);
  return `<div class="detail"><div class="detail-label">${escapeHtml(label)}</div><div class="detail-value">${escapeHtml(display)}</div></div>`;
}

function money(cents) {
  const value = Number(cents || 0) / 100;
  return `$${value.toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function safeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnv(rawValue.trim());
  }
}

function unquoteEnv(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
