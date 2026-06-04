# Travelyt App Store Submission Package

Last updated: June 1, 2026

## Build And Signing

iOS target:

- Bundle ID: `app.travelyt.travelyt`
- Version: `1.0`
- Build: `6`
- Apple team: `CQ67GR327Q`
- Release signing: automatic
- Installed provisioning profile: `iOS Team Store Provisioning Profile: app.travelyt.travelyt`

The codebase currently builds cleanly for Release/device with signing disabled.
To archive/upload, use automatic signing with the installed Xcode-managed App
Store Connect provisioning profile for bundle ID `app.travelyt.travelyt` and
the installed Apple Distribution certificate for team `CQ67GR327Q`.

After the profile is installed, archive from Xcode or run:

```sh
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /Users/jp/Desktop/Travelyt-AppStore/Travelyt-1.0-6.xcarchive \
  archive
```

To upload from the command line after a successful archive:

```sh
xcodebuild -exportArchive \
  -archivePath /Users/jp/Desktop/Travelyt-AppStore/Travelyt-1.0-6.xcarchive \
  -exportPath /Users/jp/Desktop/Travelyt-AppStore/export \
  -exportOptionsPlist app-store/ExportOptions-AppStore.plist
```

## App Information

App name: Travelyt

Subtitle: Hands-free luggage help

Category: Travel

Secondary category: Lifestyle

Content rights: Travelyt owns or has rights to use the app content, logo, and listed visuals.

Age rating notes: No user-generated public content, no gambling, no unrestricted web browsing, no medical content, no mature content. Recommended rating: 4+.

Copyright: 2026 Travelyt, Inc.

Privacy Policy URL: https://travelyt.us/privacy

Terms URL: https://travelyt.us/terms

Support URL: https://travelyt.us/support

Marketing URL: https://travelyt.us

## App Store Copy

Promotional text:

Travel light from the moment you leave home. Travelyt helps travelers request luggage pickup, airport handoff, arrival delivery, and verified bag status for supported launch routes.

Description:

Travelyt helps travelers move through the airport without dragging every bag through the terminal.

Use Travelyt to request door pickup, airport handoff, arrival delivery, or round-trip baggage support for supported launch markets. Select your airport, travel date, bag count, and service type, then submit a request so the Travelyt team can confirm availability and coordinate the next step.

Travelyt is designed for families, business travelers, seniors, groups, and anyone who wants a smoother airport day.

Key features:

- Request luggage pickup or arrival delivery
- Select major US airports and trip details
- See clear service estimates before submitting
- Apply eligible launch promos
- View request and bag status in the app
- Track chain-of-custody style milestones
- Receive app notifications for supported booking updates
- Manage profile details and account deletion

Travelyt is currently launching in selected markets. Service availability, airport procedures, and timing are confirmed after request submission. Airline baggage fees, airline acceptance, and airport rules remain separate from Travelyt service fees.

Keywords:

luggage,baggage,airport,travel,pickup,delivery,suitcase,airline,trip,concierge

## Review Notes

Travelyt is a travel logistics app for requesting real-world luggage pickup and delivery services. Users can request service, see an estimated total, and pay through secure third-party checkout for supported launch routes. Travelyt confirms operational availability before custody begins.

No login is required to test the core flow:

1. Open the app.
2. Tap Book.
3. Select a service type.
4. Enter airport, address, date, bag count, and contact details.
5. Submit the request.
6. View the request status page.

Payments:

Travelyt sells a real-world luggage service fulfilled outside the app. Payments are processed for physical travel/logistics services through Stripe or another payment method appropriate for physical goods and services, not Apple in-app purchase for digital content.

Important reviewer context:

Travelyt is not an airline and does not claim to check bags directly with an airline on behalf of a passenger in this launch build. It coordinates passenger-authorized luggage pickup, tracking, and handoff support where available. Airline baggage fees, TSA rules, airport rules, and airline acceptance remain separate.

Account deletion:

If a reviewer creates an account, account deletion is available in Profile -> Settings -> Delete my account.

Demo routes/data:

The app is safe to test with sample data such as:

- Airport: IAD or LAX
- Address: 123 Main St, Washington, DC
- Date: any future date
- Flight: UA 123
- Bags: 2
- Name: App Review
- Email: reviewer@example.com
- Phone: optional; leave blank or use +1 555 000 0000

## App Privacy Details For App Store Connect

Data linked to the user:

- Name: App Functionality
- Email Address: App Functionality
- Phone Number: App Functionality, optional customer/applicant contact detail only when provided
- Physical Address: App Functionality
- User ID: App Functionality
- Photos or Videos: App Functionality, only when proof-of-handling photos are used
- Location: App Functionality, driver GPS custody checkpoints for active bookings
- Device ID: App Functionality, push notifications and app operation

Data not used for tracking:

- Travelyt does not sell personal data.
- Travelyt does not use collected data for cross-context behavioral advertising.
- Tracking should be answered as No.

Payment information:

- Payment card details are processed by Stripe or another payment processor.
- Travelyt does not store full card numbers or card security codes.

Location:

- Current launch build collects addresses and driver GPS custody checkpoints for route start, arrival, pickup proof, handoff proof, and delivery proof.
- Travelyt does not collect continuous background location in this build.

## Screenshot Set

Use the generated screenshots in `app-store/screenshots/iphone-6.9/`,
`app-store/screenshots/iphone-6.5/`, and `app-store/screenshots/ipad-13/`.

Recommended order:

1. Home / Door to gate
2. Book bags / Service choice
3. Trip details / Airport and bags
4. Review request / Transparent estimate
5. Request status / Chain-of-custody milestones
6. Trust / Insured and tracked

## Current Submission Positioning

Use "request", "quote", "launch routes", and "availability confirmation" language.

Avoid saying:

- We check your bags with United, TSA, or any airline.
- Payment is available in-app.
- Service is available everywhere.
- Delivery is guaranteed before operations confirm the route.

Use:

- Request luggage pickup or arrival delivery.
- Travelyt confirms availability before collecting payment.
- Airline baggage fees and airport rules remain separate.
- Launch markets are limited while operations expand.
