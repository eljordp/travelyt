# Travelyt Partner Integration Overhaul

## Current Status

- `npm run lint` passes.
- `npm run build` passes.
- Vercel project is the real `travelyt` project.
- Live `https://travelyt.us`, `/quote`, `/driver`, and `/admin` return `200`.
- Public bookings are already hardened: customer-created bookings default to `pending`; payment, assignment, driver, custody, proof, and status fields stay behind ops/driver/admin paths.

## Main Point

Do not hard-code United, Royal Jordanian, Stasher, or any future partner directly into the booking flow.

Travelyt needs a partner adapter layer:

1. Travelyt keeps one internal booking and custody model.
2. Each outside system becomes a provider adapter.
3. Provider events get stored in an event log.
4. Travelyt rules decide whether partner data updates the customer-visible booking.

## Partner Categories

- Airlines: United, Royal Jordanian, airline baggage offices, airline-approved baggage systems.
- Storage: Stasher, Bounce-style storage, lockers, hotel luggage storage.
- Travel partners: hotels, concierge desks, OTAs, airport partners.
- Generic operations partners: courier networks, dispatch systems, support tools.

## Build Order

1. Stabilize the current app.
2. Add provider registry and partner event log.
3. Start with read-only status/availability integrations.
4. Add lower-risk create/cancel integrations like luggage storage.
5. Add inbound webhooks with signature checks.
6. Only add airline writeback after signed partner terms and approved credentials.

## Deployment Gate

1. Apply `supabase/migrations/018_partner_integration_layer.sql`.
2. Deploy the code with partner integrations disabled by default.
3. Set `PARTNER_INTEGRATIONS_ENABLED=true` and `NEXT_PUBLIC_PARTNER_INTEGRATIONS_ENABLED=true` only when the admin panel should show the partner registry and event log.
4. Keep provider records inactive until ops has credentials, terms, and a tested handoff process for that provider.

## Guardrails

- No partner name/logo should imply partnership until signed.
- Partner events are append-only.
- External systems cannot bypass Travelyt custody proof, GPS, ID, Stripe, admin review, or driver access rules.
- API credentials stay server-side.
- Airline baggage-system writeback is the last step, not the first.

## Files Added

- `src/lib/partner-integrations.ts`
- `supabase/migrations/018_partner_integration_layer.sql`
- `docs/Travelyt/19-Partner-Integration-Overhaul.md`

## First Practical Target

Start with a storage-style partner lane before airline writeback. It gives Travelyt real external integration capability with less regulatory and airport-operation risk.
