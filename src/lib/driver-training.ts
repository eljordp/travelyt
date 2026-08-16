export const DRIVER_TRAINING_VERSION = "driver-foundations-v1-2026-08";

export const DRIVER_TRAINING_MODULES = [
  {
    id: "service_boundaries",
    title: "What Travelyt is—and the lines we never cross",
    summary: "Move baggage under a verifiable custody process without impersonating a traveler or claiming unapproved airline authority.",
    points: [
      "Travelyt moves bags, not passengers. The passenger completes their own airline check-in unless a separately documented carrier process says otherwise.",
      "Never claim an airline is a Travelyt partner or that airline acceptance is guaranteed unless operations has documented that authorization for the booking.",
      "The sealed custody record is the product. Record every scan, photo, signature, time, location, and exception truthfully.",
    ],
  },
  {
    id: "readiness",
    title: "Your readiness file and credentials",
    summary: "Work only under your own approved account with current identity, insurance, vehicle, and training evidence.",
    points: [
      "Use only your own driver access code and assigned job. Never share credentials or work under another person's identity.",
      "Expired or rejected readiness evidence blocks live custody until operations reviews a valid replacement.",
      "If your vehicle changes, upload the new registration and vehicle photos before using it for a run.",
    ],
  },
  {
    id: "pickup",
    title: "Pickup protocol",
    summary: "Match the traveler, booking, bag, declarations, condition, weight, seal, and badge before custody starts.",
    points: [
      "Match the traveler to the booking and complete required consent, identity, restricted-item declarations, bag count, exterior condition, and weight before pickup.",
      "If the booking requires a declaration image, the traveler presents the open-view surface for the required photo. The driver never searches, screens, or rearranges contents.",
      "Apply the assigned numbered tamper-evident seal, record its exact number, attach the bag badge, capture required proof, and complete the pickup scan before the bag moves.",
    ],
  },
  {
    id: "transit",
    title: "In-transit custody",
    summary: "Use the assigned route, keep the vehicle secured, and record both sides of any authorized driver transfer.",
    points: [
      "Keep bags secured, out of view, and never unattended in an unlocked vehicle. Do not make personal stops while carrying a bag.",
      "An authorized driver-to-driver transfer requires transfer-out and transfer-in records tied to two individually approved drivers.",
      "Never break, replace, or re-apply a seal. A damaged or mismatched seal is an exception that stops normal movement.",
    ],
  },
  {
    id: "airport_handoff",
    title: "Airport handoff and screening boundary",
    summary: "Use only the booking's configured lawful handoff path; Travelyt does not perform airline screening.",
    points: [
      "Do not open, search, screen, tag, clear, or activate a passenger bag for an airline, and do not enter badge-controlled areas without separate authorization.",
      "Record the receiving person's name, role, organization, configured location, time, acceptance reference, bag ID, proof photo, and seal condition.",
      "If the configured receiver refuses or is absent, keep custody, open an exception, and contact operations. Never abandon a bag or give it to an unverified person.",
    ],
  },
  {
    id: "arrival_delivery",
    title: "Arrival delivery",
    summary: "Apply the same custody discipline from the authorized airport pickup through delivery to the verified recipient.",
    points: [
      "Record airport pickup, seal status, direct transit, arrival, and delivery checkpoints as they actually occur.",
      "At delivery, match the recipient to the booking and capture the required sealed-bag proof, signature, time, GPS, and delivery scan.",
      "If the verified recipient is unavailable, keep custody and contact operations. Do not leave luggage at a door or with an unverified substitute.",
    ],
  },
  {
    id: "incidents",
    title: "Incidents and escalation",
    summary: "Stop, preserve evidence, and escalate immediately when safety or chain-of-custody integrity fails.",
    points: [
      "Escalate a broken seal, damaged or missing bag, wrong bag, identity mismatch, vehicle accident, dispute, missing receiver, prohibited-item concern, or unsafe delay.",
      "If law enforcement, TSA, airport security, or another authorized official gives a lawful instruction, comply, record identifying details when safe, and contact operations.",
      "Do not improvise compensation, promises, a replacement seal, a recipient, or a custody event. Preserve control and wait for instructions.",
    ],
  },
  {
    id: "privacy_conduct",
    title: "Privacy, photo proof, and conduct",
    summary: "Keep customer information and operational proof inside approved systems and act professionally at every location.",
    points: [
      "Customer identity, address, travel, and bag information is confidential. Never share it on social media, personal messages, group chats, or personal storage.",
      "Capture only the proof required for the checkpoint and submit it through the Travelyt app; do not keep or forward personal copies.",
      "Use a clean approved vehicle, arrive on time or communicate through operations, and never backfill or fabricate proof.",
    ],
  },
] as const;

export type DriverTrainingModuleId = (typeof DRIVER_TRAINING_MODULES)[number]["id"];

export const DRIVER_TRAINING_QUESTIONS = [
  {
    id: "passenger_checkin",
    prompt: "A customer asks you to check their bag in at the airline counter as their assistant. What do you do?",
    options: [
      { id: "refuse_boundary", label: "Explain that you cannot impersonate the traveler or promise airline check-in; follow only the configured custody handoff" },
      { id: "short_line", label: "Do it if the airline line is short" },
      { id: "assistant", label: "Say you are the passenger's assistant and try the counter" },
    ],
  },
  {
    id: "shared_code",
    prompt: "Another person offers to cover your pickup using your access code. What do you do?",
    options: [
      { id: "share_once", label: "Share the code once and tell operations later" },
      { id: "refuse_contact_ops", label: "Refuse and contact operations so the run can be reassigned to an individually approved driver" },
      { id: "customer_permission", label: "Allow it if the customer agrees" },
    ],
  },
  {
    id: "failed_scan",
    prompt: "The app cannot record the pickup scan and the traveler is in a hurry. What is allowed?",
    options: [
      { id: "take_later", label: "Take the bag and scan it later" },
      { id: "photo_substitute", label: "Use a personal-phone photo instead" },
      { id: "stop_no_custody", label: "Do not take custody; contact operations and record the technical exception" },
    ],
  },
  {
    id: "seal_mismatch",
    prompt: "You notice a seal is damaged or does not match the booking record. What is the next action?",
    options: [
      { id: "replace", label: "Replace the seal so it looks correct" },
      { id: "stop_exception", label: "Stop, preserve control, photograph it as found, and open an exception" },
      { id: "continue", label: "Continue if the bag still looks closed" },
    ],
  },
  {
    id: "missing_receiver",
    prompt: "The configured airport receiver is absent or refuses the bag. What do you do?",
    options: [
      { id: "nearby_employee", label: "Leave it with any nearby airline employee" },
      { id: "leave_point", label: "Leave it at the listed point because you arrived on time" },
      { id: "retain_escalate", label: "Keep custody, open an exception, and contact operations for the authorized next action" },
    ],
  },
  {
    id: "substitute_recipient",
    prompt: "At home delivery, the verified recipient is absent and a roommate offers to sign. What do you do?",
    options: [
      { id: "roommate", label: "Deliver to the roommate if they sign" },
      { id: "text", label: "Deliver if the recipient texts your personal phone" },
      { id: "retain", label: "Keep custody and contact operations because the verified recipient is unavailable" },
    ],
  },
  {
    id: "official_instruction",
    prompt: "Airport security or law enforcement gives a lawful instruction about the bag. What do you do?",
    options: [
      { id: "argue", label: "Refuse until a Travelyt manager arrives" },
      { id: "comply_record", label: "Comply, preserve identifying details when safe, and contact operations immediately" },
      { id: "leave", label: "Leave the area without recording anything" },
    ],
  },
  {
    id: "privacy",
    prompt: "A run takes you to a well-known person's home. What is allowed?",
    options: [
      { id: "tell_friends", label: "Tell friends without sharing the street" },
      { id: "personal_photo", label: "Keep one personal photo if you do not post it" },
      { id: "same_private_protocol", label: "Use the same required proof and share nothing outside approved Travelyt systems" },
    ],
  },
] as const;

export type DriverTrainingQuestionId = (typeof DRIVER_TRAINING_QUESTIONS)[number]["id"];

export const DRIVER_TRAINING_CORRECT_ANSWERS: Record<DriverTrainingQuestionId, string> = {
  passenger_checkin: "refuse_boundary",
  shared_code: "refuse_contact_ops",
  failed_scan: "stop_no_custody",
  seal_mismatch: "stop_exception",
  missing_receiver: "retain_escalate",
  substitute_recipient: "retain",
  official_instruction: "comply_record",
  privacy: "same_private_protocol",
};

export const DRIVER_TRAINING_PASSING_SCORE = 100;
