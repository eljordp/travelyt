import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = process.env.TRAVELYT_SOURCE_ROOT || process.cwd();
const fixturePath = path.join(sourceRoot, "simulations/fixtures/rj-ord-current-state.v1.json");
const outputDir = path.resolve(process.argv[2] || "/private/tmp/travelyt-rj-ord-integrated-checkpoint");
const facts = JSON.parse(await readFile(fixturePath, "utf8"));

const unknowns = Object.entries(facts.facts)
  .filter(([, fact]) => fact.status === "rj_confirmation_required")
  .map(([key]) => key);

function runCheckpoint(input) {
  const events = [];
  const record = (type) => events.push(type);

  if (!input.authorization || !input.stationWorkflowApproved) {
    record("HANDOFF_BLOCKED");
    return { outcome: "fail_closed", events };
  }
  if (input.vendorDocumentsPresent === false) {
    record("PROMOTION_BLOCKED_VENDOR_DOCS_MISSING");
    return { outcome: "simulation_only_no_promotion", events };
  }
  if (input.arrivalMinutesBeforeDeparture < input.handoffTargetMinutes) {
    record("HANDOFF_TARGET_MISSED");
    return { outcome: "safe_no_go", events };
  }
  if (input.receiverId !== input.authorizedReceiverId) {
    record("RECEIVER_MISMATCH");
    return { outcome: "hold_no_transfer", events };
  }
  if (input.sealCompromised || input.prohibitedItem) {
    record(input.sealCompromised ? "SEAL_COMPROMISED" : "PROHIBITED_ITEM");
    record("HANDOFF_REFUSED");
    record("RETURN_CUSTODY_STARTED");
    return { outcome: "refuse_hold_return", events };
  }

  record("MANIFEST_VERIFIED");
  record("CUSTODY_OFFERED");
  if (input.gatewayTimeout) {
    record("OUTCOME_UNKNOWN");
    record("MANUAL_RECONCILIATION_REQUIRED");
    return { outcome: "manual_reconciliation_no_retry", events };
  }
  if (input.tagCount !== input.bagCount || input.tagActivationState !== "inactive_until_airline_acceptance") {
    record("UNSAFE_TAG_RESPONSE_REJECTED");
    return { outcome: "reject_unsafe_response", events };
  }

  record("INACTIVE_TAGS_RECORDED");
  record("AIRLINE_ACCEPTANCE_RECORDED");
  const uniqueWebhookIds = new Set(input.webhookIds);
  for (const webhookId of uniqueWebhookIds) record(`TAG_ACTIVATED:${webhookId}`);
  if (input.webhookIds.length > uniqueWebhookIds.size) record("DUPLICATE_WEBHOOK_IGNORED");
  return {
    outcome: input.webhookIds.length > uniqueWebhookIds.size
      ? "one_state_transition"
      : "accepted_with_inactive_tags_then_airline_activation",
    events,
  };
}

const approvedBase = {
  authorization: true,
  stationWorkflowApproved: true,
  vendorDocumentsPresent: true,
  arrivalMinutesBeforeDeparture: 180,
  handoffTargetMinutes: 180,
  receiverId: "RJ_HANDLER_ORD_RECEIVER_01",
  authorizedReceiverId: "RJ_HANDLER_ORD_RECEIVER_01",
  sealCompromised: false,
  prohibitedItem: false,
  gatewayTimeout: false,
  bagCount: 2,
  tagCount: 2,
  tagActivationState: "inactive_until_airline_acceptance",
  webhookIds: ["evt-accept-01"],
};

const scenarioDefinitions = [
  { id: "RJ-ORD-01", title: "Simulated approved-state happy path", expected: "accepted_with_inactive_tags_then_airline_activation", input: {}, controls: ["verified passenger-to-bag manifest", "sealed custody event", "simulated named handler match", "inactive tag response", "airline acceptance event"], liveGate: "RJ written passenger-absent tender procedure and sandbox contract" },
  { id: "RJ-ORD-02", title: "Authorization missing outside approved checkpoint", expected: "fail_closed", input: { authorization: false }, controls: ["station-workflow gate", "authorization gate"], liveGate: "RJ written authorization" },
  { id: "RJ-ORD-03", title: "Receiving handler identity mismatch", expected: "hold_no_transfer", input: { receiverId: "UNAUTHORIZED_RECEIVER" }, controls: ["receiver roster match", "no custody-signature creation"], liveGate: "RJ named ORD handler and authorized roles" },
  { id: "RJ-ORD-04", title: "Partial airline tag response", expected: "reject_unsafe_response", input: { tagCount: 1 }, controls: ["bag-count reconciliation", "inactive-tag contract"] },
  { id: "RJ-ORD-05", title: "Gateway timeout after possible acceptance", expected: "manual_reconciliation_no_retry", input: { gatewayTimeout: true }, controls: ["idempotency key", "outcome-unknown state", "lookup before retry"], liveGate: "RJ timeout and lookup procedure" },
  { id: "RJ-ORD-06", title: "Duplicate acceptance webhook", expected: "one_state_transition", input: { webhookIds: ["evt-accept-01", "evt-accept-01"] }, controls: ["signed event", "event idempotency", "duplicate suppression"] },
  { id: "RJ-ORD-07", title: "Broken seal or prohibited item", expected: "refuse_hold_return", input: { sealCompromised: true }, controls: ["reason code", "airport hold", "return custody trail"], liveGate: "RJ rejection reason mapping and receiving procedure" },
  { id: "RJ-ORD-08", title: "Three-hour handoff target missed", expected: "safe_no_go", input: { arrivalMinutesBeforeDeparture: 179 }, controls: ["dispatch ETA", "17:00 local target for a simulated 20:00 departure", "customer/ops exception"] },
  { id: "RJ-ORD-09", title: "Vendor documents absent", expected: "simulation_only_no_promotion", input: { vendorDocumentsPresent: false }, controls: ["fact-status boundary", "live gate register"], liveGate: "RJ handler/vendor documents" },
];

const scenarios = scenarioDefinitions.map((definition) => {
  const execution = runCheckpoint({ ...approvedBase, ...definition.input });
  return {
    id: definition.id,
    title: definition.title,
    result: definition.expected === execution.outcome ? "PASS" : "FAIL",
    expected: definition.expected,
    observed: execution.outcome,
    events: execution.events,
    controls: definition.controls,
    liveGate: definition.liveGate ?? null,
  };
});

const counts = Object.fromEntries(["PASS", "FAIL"].map((result) => [result, scenarios.filter((item) => item.result === result).length]));
const result = {
  generatedAt: new Date().toISOString(),
  mode: "NON_PRODUCTION_SIMULATED_RJ_APPROVED_CHECKPOINT",
  fixture: path.relative(sourceRoot, fixturePath),
  verdict: counts.FAIL === 0 ? "SIMULATION_PASS_LIVE_GATES_REMAIN" : "SIMULATION_FAIL",
  counts: { scenarios: scenarios.length, ...counts },
  verifiedPublicFacts: Object.entries(facts.facts).filter(([, fact]) => fact.status === "verified_public").map(([key]) => key),
  unresolvedLiveGates: unknowns,
  scenarios,
  promotionRule: "This result can never enable production. Production remains locked by the runtime RJ readiness gates, RJ's written ORD procedure, bound insurance, named staff, and a signed physical rehearsal.",
  nonActions: ["No airline request", "No production API call", "No Supabase write", "No payment", "No customer bag", "No deployment"],
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "rj-ord-integrated-checkpoint-results.json"), `${JSON.stringify(result, null, 2)}\n`);
const rows = scenarios.map((item) => `| ${item.result} | ${item.id} | ${item.title} | ${item.observed} |`).join("\n");
const report = `# RJ ORD Integrated Checkpoint Simulation\n\n**${result.verdict}**\n\nThis is a non-production simulation of the future state in which RJ has approved the ORD handoff. It tests Travelyt's staged control path; it does not supply airline, handler, airport, or TSA authority.\n\n## Results\n\n- ${counts.PASS}/${scenarios.length} scenarios passed\n- ${unknowns.length} live facts remain RJ-confirmation gates\n\n| Result | ID | Scenario | Safe outcome |\n|---|---|---|---|\n${rows}\n\n## Unresolved live gates\n\n${unknowns.map((key) => `- ${key}`).join("\n")}\n\n## Promotion boundary\n\n${result.promotionRule}\n\n## Non-actions\n\n${result.nonActions.map((item) => `- ${item}`).join("\n")}\n`;
await writeFile(path.join(outputDir, "rj-ord-integrated-checkpoint-report.md"), report);
console.log(JSON.stringify({ verdict: result.verdict, counts: result.counts, unresolvedLiveGates: unknowns.length, outputDir }));
