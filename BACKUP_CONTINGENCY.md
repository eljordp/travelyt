# Travelyt Backup Ops Contingency

This is the separate deploy/storage/export layer for when the normal Travelyt app, admin portal, driver portal, customer tracking, Vercel, or Supabase path is degraded.

## What exists now

- `npm run backup:export` generates a static emergency ops kit from Supabase.
- Output goes to `ops-backups/latest/` plus a timestamped folder.
- The kit includes active run sheets, CSV, JSON, proof metadata, GPS links, tracking links, and a failure playbook.
- `ops-backups/` is gitignored because it contains customer/job PII.

## Operator flow

1. Run `npm run backup:export` before live demos, before high-risk airport runs, and after major live booking changes.
2. Open `ops-backups/latest/index.html` locally to verify the packet generated.
3. Upload the entire `ops-backups/latest/` folder to a password-protected emergency host.
4. If the app is down, operate from the run sheets by phone/text.
5. Record any manual status, proof, payment, customer, or driver updates in a shared incident note.
6. When Travelyt recovers, reconcile every manual update back into the admin portal.

## Emergency host requirements

Use a host that is operationally separate from the main customer app. Do not rely only on another page under `travelyt.us`.

Minimum acceptable v1:

- Separate hosting account from the main Vercel project.
- Password protection or access restriction.
- No public indexing.
- Manual upload is acceptable for v1.
- Only the newest active export should stay online.

Better v2:

- Separate domain or subdomain pointed to a different provider.
- Basic auth at the edge.
- Retention policy that deletes old exports.
- Audit note of who generated/uploaded each kit.

## Security rules

- Never commit `ops-backups/`.
- Never put the kit on a public URL.
- Do not send CSV/JSON to anyone who does not need operations access.
- Treat the tracking links as sensitive because they include customer-access tokens.
- Delete stale exports after they are no longer operationally needed.

## Failure decision rule

If any normal role surface is down:

- Customer app down: dispatcher communicates by phone/text and sends proof manually.
- Driver portal down: dispatcher sends the run sheet to the driver and collects photos/GPS by text.
- Admin portal down: backup ops lead runs the job from this static kit.
- Supabase down: use the last generated kit and reconcile after recovery.
- Payment unclear: check Stripe before custody unless admin explicitly approves an exception.
