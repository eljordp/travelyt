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
TRAVELYT_ADMIN_ACCESS_CODE=
TRAVELYT_ADMIN_SESSION_SECRET=
TRAVELYT_DRIVER_SESSION_SECRET=
TRAVELYT_ALLOW_LEGACY_DRIVER_CODE=false
TRAVELYT_DRIVER_ACCESS_CODE=
TRAVELYT_DRIVER_ACCESS_CODES="Driver Name:one-time-driver-code,Second Driver:second-driver-code"
GOOGLE_MAPS_API_KEY=
SUPABASE_PUSH_WORKER_URL=
PUSH_WORKER_SECRET=

RESEND_API_KEY=
LEAD_NOTIFY_EMAIL=info@travelyt.us
LEAD_FROM_EMAIL="Travelyt <info@travelyt.us>"

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
```

Run the SQL in `supabase/migrations` against your Supabase project before
testing live bookings. Without Supabase variables, the app falls back to local
browser storage so the prototype remains usable.

If the project is linked with the Supabase CLI, apply the current migrations
with:

```sh
supabase db push
```

Production deploy checklist:

```sh
vercel env ls
supabase db push
```

Confirm Vercel has `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `LEAD_NOTIFY_EMAIL`, `LEAD_FROM_EMAIL`,
`TRAVELYT_ADMIN_ACCESS_CODE`, `TRAVELYT_ADMIN_SESSION_SECRET`,
`TRAVELYT_DRIVER_SESSION_SECRET`, `GOOGLE_MAPS_API_KEY`, and the Stripe env
vars before testing live customer requests.

Create driver codes in Admin -> Driver access codes. Each code is assigned to
one courier profile, can be revoked, and is stored hashed in Supabase. Keep
`TRAVELYT_DRIVER_ACCESS_CODES` or `TRAVELYT_DRIVER_ACCESS_CODE` only as a
temporary beta fallback while onboarding the first trusted drivers. The shared
`TRAVELYT_DRIVER_ACCESS_CODE` fallback only works after the database table
exists if `TRAVELYT_ALLOW_LEGACY_DRIVER_CODE=true` is deliberately enabled.

Set `GOOGLE_MAPS_API_KEY` to enable server-side pickup-address verification and
automatic mileage estimates. Without it, customers can still enter mileage
manually.

Set `PUSH_WORKER_SECRET` in Vercel and Supabase to the same value so booking
status/proof updates can wake the Supabase APNs worker immediately after a push
event is queued. `SUPABASE_PUSH_WORKER_URL` is optional; the app derives it from
`SUPABASE_URL` when omitted.

Without Resend variables, booking and lead requests still work, but email
notifications are skipped.

Resend covers email. SMS will need a separate provider such as Twilio; set the
Twilio variables once SMS booking alerts are wired.

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
  APNS_PRODUCTION=true \
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

Use `APNS_PRODUCTION=false` only for local debug builds with the development
APNs entitlement. TestFlight and App Store distribution use the production APNs
environment, so keep `APNS_PRODUCTION=true` there.

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
proof capture, GPS checkpoint capture, and push permission timing.

## Current Product Notes

- Booking data is backend-backed when Supabase is configured, with local browser
  storage as a development fallback.
- Native push tokens are persisted in Supabase and booking updates are queued in
  `push_notification_events` for an APNs worker to send.
- Login and registration use Supabase Auth when public Supabase variables are
  configured.
- The native app loads the hosted Vercel app and shows a local offline screen
  if the remote app cannot load.
- Push permission is requested from the booking detail screen after the
  customer opts into live updates.
- Driver custody actions use native geolocation on iOS/Android when running in
  the Capacitor shell, with browser geolocation as the web fallback.
- The iOS target includes a privacy manifest plus camera, photo, and location
  usage strings for App Store review.
