# Live Identity Verification Runbook

## Purpose

Prove one real Travelyt customer can consent, complete document and selfie checks through the configured identity provider, return to Travelyt, and appear in the internal verification record. This is a human-controlled production test, not an automated simulation.

## Before the live run

1. Confirm whether the deployed Stripe keys are test or live mode. Do not infer this from variable names.
2. Confirm the Stripe Identity product is activated for the same Stripe account.
3. Confirm the signed webhook endpoint is enabled and its secret matches the deployed environment.
4. Use a named test operator and a real Travelyt login that the operator controls.
5. Use the operator's own unexpired government ID and live selfie. Do not send copies through chat or place them in the repository.
6. Confirm the separate identity-image consent and the current retention/deletion notice before capture.

## Human run

1. Sign in to Travelyt with the test customer account.
2. Open the customer identity-verification screen.
3. Read and sign the separate identity-image consent.
4. Start the secure identity session.
5. On the provider-hosted capture screen, photograph the operator's government ID and complete the live selfie/liveness step.
6. Return to Travelyt and wait for the signed provider webhook.
7. Refresh the account and booking. Do not manually mark the customer verified.

## Pass evidence

- The provider session has a final verified result.
- Travelyt records provider, provider reference, verified timestamp, and verified date of birth.
- The signed webhook event is accepted once; replay does not create a second verification.
- A DOB mismatch, provider decline, cancellation, or timeout remains fail-closed.
- The customer-facing screen shows the final status without exposing ID numbers or document images.
- Private originals, if retained under the signed consent, are available only through controlled storage paths and not public URLs.
- Admin sees the real status; custody readiness clears only when every independently verifying adult is complete.

## Negative controls

Run in provider test mode before the production human run:

1. Verified document and selfie.
2. Provider decline.
3. Customer cancels capture.
4. Session expires.
5. DOB mismatch against the traveler record.
6. Replayed webhook.
7. Wrong authenticated user tries to open the result.
8. Adult family member tries to reuse another adult's email or verification.

## Stop conditions

Stop the live run if key mode is uncertain, consent/retention text is absent, webhook signature validation fails, a private image resolves publicly, or an operator is asked to upload an ID outside the provider-hosted or private Travelyt flow.
