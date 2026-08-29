# Travelyt Google Play Submission Package

## App identity

- App name: `Travelyt: Luggage Pickup`
- Default language: English (United States)
- App or game: App
- Free or paid: Free
- Category: Travel & Local
- Package name: `app.travelyt.travelyt`
- Support email: `info@travelyt.us`
- Website: `https://travelyt.us`
- Privacy policy: `https://travelyt.us/privacy`
- Account deletion URL: `https://travelyt.us/profile`

## Store listing copy

Short description:

> Request luggage pickup and arrival delivery for supported airport routes.

Full description:

> Travelyt helps travelers move through the airport without dragging every bag through the terminal.
>
> Request door pickup, airport handoff support, or arrival delivery for supported launch markets. Select your airport, travel date, bag count, and service type, then submit a request so the Travelyt team can confirm availability and coordinate the next step.
>
> Travelyt is designed for families, business travelers, seniors, groups, and anyone who wants a smoother airport day.
>
> Features:
>
> - Request departure pickup or arrival delivery
> - Enter airport, trip, address, and bag details
> - Review clear service estimates before submitting
> - View request and bag status
> - Track chain-of-custody milestones and proof
> - Receive supported booking notifications
> - Manage profile details and account deletion
>
> Travelyt is launching in selected markets. Service availability, airport procedures, and timing are confirmed after request submission. Travelyt is not an airline. Airline baggage fees, airline acceptance, airport rules, and government screening requirements remain separate from Travelyt service fees.

## Graphic assets

- Play icon: `assets/travelyt-play-icon-512.png`
- Feature graphic: `assets/travelyt-feature-1024x500.jpg`
- Phone screenshots: capture after the signed build is installed on a real
  Android device; save approved files under `assets/phone/`

Capture four customer-facing Android screenshots in this order:

1. Travel light
2. Book your handoff
3. Track every handoff
4. Clear help when plans change

Do not reuse the existing iPhone/App Store composites: the first contains an
Apple download badge and the phone frame is platform-specific. Do not use the
courier screenshot in the customer listing. The driver app is a separate future
product and should not broaden the current customer-app review.

## App access for review

- Start at `https://travelyt.us/demo`.
- Provide the seeded customer credentials in Play Console under App access.
- Explain that the public quote flow can be tested without login.
- Do not give reviewers privileged production admin credentials.

## Data safety working draft

This is a technical inventory, not a substitute for legal review. Confirm it
against every production SDK and provider before submitting the declaration.

Data collected for app functionality, fraud prevention, security, analytics,
or account management may include:

- Name, email address, phone number, user ID, and physical address
- Trip, airport, flight, bag, booking, and purchase-history information
- Precise location for optional active custody checkpoints; no continuous
  background location
- Photos, videos, files, or documents submitted for handling proof or identity
  review
- Device or other identifiers used for authentication, analytics, security,
  and push notifications
- App interactions and diagnostic information collected through the hosted web
  app and its production analytics providers

Payment card numbers and security codes are processed by Stripe and are not
stored by Travelyt. Identity verification may be processed by Stripe Identity
or an approved provider. Travelyt does not sell personal data or use it for
cross-context behavioral advertising.

All collected data is transmitted over HTTPS. Account deletion is available in
Profile -> Settings -> Delete account and is described at
`https://travelyt.us/privacy`.

## Policy declarations

- Ads: No, unless an advertising SDK is added before submission
- Target audience: Adults / general travelers; not directed to children
- News app: No
- Government app: No
- Financial features: No
- Health features: No
- Content rating: Complete the Play questionnaire from actual app content
- Permissions: Camera, foreground precise/approximate location, notifications,
  and photo access only where the user invokes the related feature
- Payments: Stripe is used only for real-world luggage/logistics services, not
  digital content

## Release notes

> First Android release of Travelyt. Request luggage pickup or arrival delivery, review trip estimates, follow booking status, and manage your account from the app.
