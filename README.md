# Travelyt

Travelyt is a Next.js and Capacitor app for airport luggage pickup, transfer,
delivery, booking requests, driver job handling, and proof-of-handling photos.

## Stack

- Next.js app router
- React
- Tailwind CSS
- Capacitor iOS and Android shells
- Resend email notifications for leads, bookings, and push token capture

## Local Development

```sh
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Create a local `.env.local` when testing notification flows:

```sh
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TRAVELYT_DRIVER_ACCESS_CODE=

RESEND_API_KEY=
LEAD_NOTIFY_EMAIL=
LEAD_FROM_EMAIL="Travelyt <onboarding@resend.dev>"
```

Run the SQL in `supabase/migrations` against your Supabase project before
testing live bookings. Without Supabase variables, the app falls back to local
browser storage so the prototype remains usable.

If the project is linked with the Supabase CLI, apply the current migrations
with:

```sh
supabase db push
```

Set `TRAVELYT_DRIVER_ACCESS_CODE` in production to prevent unauthenticated
listing and driver status updates. Couriers enter this code on `/driver`.

Without Resend variables, booking and lead requests still work, but email
notifications are skipped.

Production deploy checklist:

```sh
vercel env ls
supabase db push
```

Confirm Vercel has `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `LEAD_NOTIFY_EMAIL`, `LEAD_FROM_EMAIL`, and the admin/driver
access code variables before testing live customer requests.

## Push Notification Worker

The Supabase Edge Function in `supabase/functions/send-push-notifications`
drains queued rows from `push_notification_events`, sends APNs notifications,
and marks each event `sent` or `failed`.

Set these Supabase function secrets before deploying:

```sh
supabase secrets set \
  APNS_KEY_ID= \
  APNS_TEAM_ID= \
  APNS_BUNDLE_ID=app.travelyt.travelyt \
  APNS_PRIVATE_KEY="$(cat AuthKey_YOURKEYID.p8)" \
  APNS_PRODUCTION=false \
  PUSH_WORKER_SECRET=
```

Deploy and test the worker:

```sh
npm run edge:check
supabase functions deploy send-push-notifications

curl -X POST \
  "https://YOUR_PROJECT_REF.functions.supabase.co/send-push-notifications" \
  -H "x-worker-secret: $PUSH_WORKER_SECRET"
```

Use `APNS_PRODUCTION=false` for debug/TestFlight builds signed with the sandbox
APNs environment, then switch it to `true` for production App Store pushes.

## iOS

The iOS shell lives in `ios/App` and loads the configured production web URL
from `capacitor.config.ts`.

```sh
npm run cap:sync
npm run cap:ios
```

Command-line build check:

```sh
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

## Quality Checks

Run these before shipping a build:

```sh
npm run lint
npm run build
npm audit --omit=dev
```

For App Store readiness, also build the `App` scheme in Xcode and verify the
simulator flow for quote creation, booking detail, driver job status, camera
proof capture, and push permission timing.

## Current Product Notes

- Booking data is backend-backed when Supabase is configured, with local browser
  storage as a development fallback.
- Customer-facing tracking lives at `/track/[id]` and uses the
  `customer_access_token` query token from booking confirmation links.
- Driver proof photos are uploaded to the private Supabase Storage bucket
  `booking-proofs` when the bucket migration has been applied; local/base64
  proof data remains as a fallback for development.
- Native push tokens are persisted in Supabase and booking updates are queued in
  `push_notification_events` for an APNs worker to send.
- Login and registration use Supabase Auth when public Supabase variables are
  configured.
- The native app loads the hosted Vercel app and shows a local offline screen
  if the remote app cannot load.
- Push permission is requested from the booking detail screen after the
  customer opts into live updates.
- The iOS target includes a privacy manifest and camera/photo usage strings for
  App Store review.
