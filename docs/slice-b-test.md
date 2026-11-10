# Slice B: prepaid checkout, test mode (scaffold)

**Status: scaffold only.** This code is for an isolated test Supabase project and Razorpay test mode. Nothing here is deployed, live, or approved for taking money. Slice A remains WhatsApp-only until its release gates pass, and the Slice B launch work listed at the end is still open.

The Slice B comparison note lives in `temp/` (scratch, not shipped); Slice A's quote contract is [docs/slice-a-pricing.md](slice-a-pricing.md).
## What exists in this scaffold

| Piece | Path |
|---|---|
| Test-only tables (intents, event log) | `supabase/migrations/20261110000000_slice_b_test_checkout.sql` (not applied) |
| Shared HMAC/money rules + fixtures | `supabase/functions/_shared/{razorpay.ts,fixtures.ts,http.ts}` |
| Create a test order from a frozen quote | `supabase/functions/create-test-order/index.ts` |
| Signed webhook receiver | `supabase/functions/verify-test-webhook/index.ts` |
| Read one intent back (capability-scoped) | `supabase/functions/checkout-status/index.ts` |
| Browser checkout, lazy | `src/services/testCheckout.ts`, `src/components/order/TestCheckout.tsx` |
| Client payload and answer tests | `src/services/testCheckout.test.ts` |
| Component states test | `src/components/order/TestCheckout.test.tsx` |
| Signature/event unit fixtures | `supabase/functions/_shared/razorpay.test.ts` |

The browser sends only `{ quote_id, retry_key }`. The amount comes from the frozen `website_quotes` snapshot as integer paise; the browser never sends a payable total. One quote can have one intent (`test_checkout_intents.quote_id` is unique), so a double tap or a retry cannot create a second payable Razorpay order.

## Environment names

Function secrets (`supabase/functions/env.example` has the names with placeholders; never commit real values):

| Name | Example placeholder | Notes |
|---|---|---|
| `SLICE_B_TEST_CHECKOUT` | `on` | Anything else makes create/status answer `503 test_checkout_disabled`. |
| `RAZORPAY_TEST_KEY_ID` | `rzp_test_EXAMPLE_key_id` | Must start `rzp_test_`; a live key is refused before any API call. |
| `RAZORPAY_TEST_KEY_SECRET` | `EXAMPLE_key_secret` | Server only. |
| `RAZORPAY_TEST_WEBHOOK_SECRET` | `EXAMPLE_webhook_secret` | Created in the Razorpay dashboard with the webhook. Unset means the webhook answers 500 instead of accepting unverifiable events. |
| `SLICE_B_ALLOWED_ORIGINS` | optional, comma-separated | The live site and `localhost:3000` are always allowed. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge runtime.

Browser variables:

| Name | Value | Notes |
|---|---|---|
| `VITE_TEST_CHECKOUT` | `true` | Shows the pay button. Leave unset everywhere else. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | existing | The functions are called with the anon key (guests have no session). |

## Webhook URL and events

Shape:

```text
https://<test-project-ref>.supabase.co/functions/v1/verify-test-webhook
```

- Deploy this one function with `--no-verify-jwt`; its authentication is `X-Razorpay-Signature`, hex HMAC-SHA256 of the exact raw body with `RAZORPAY_TEST_WEBHOOK_SECRET`. The other two keep the Supabase JWT check.
- Register it in the Razorpay dashboard (test mode) and save the generated secret as `RAZORPAY_TEST_WEBHOOK_SECRET`.
- Events this scaffold understands: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
- `refund.created` is acknowledged and ignored: a refund request is not money returned. `refund.processed` is the final refund event.
- Delivery is deduplicated by `x-razorpay-event-id` (or the body's SHA-256 when the header is absent). Every attempt is kept in `test_payment_events`, including ignored ones.
- The function answers `200` only after the event is stored. A database failure answers `500` so Razorpay retries; the guarded updates make the retry safe.
- An amount or currency that differs from the intent is stored as `amount_mismatch` and changes nothing. Partial refunds are therefore visible for review and are not treated as a full refund.
- The webhook never creates an order and never touches the kitchen. It only moves `test_checkout_intents.status`: `created → paid`, `created → failed`, `paid → refunded`. A failed event cannot undo a capture, and a second successful payment is ignored.

Razorpay does not prove the webhook is from the test account with the key alone; the signature is the proof. The return signature (`order_id|payment_id`) is checked by `checkout-status` but only for display: the webhook is what marks an intent paid.

## Function contracts

`POST create-test-order` → `{ quote_id, retry_key }`

- `200 { intent_id, order_id, key_id, amount_paise, currency, environment: "test", quote_id, reused }`
- `400 invalid_request` (bad UUID or retry key), `404 quote_not_found`, `409 quote_expired`, `409 quote_invalid`, `409 already_ordered`, `409 already_paid`, `409 creating_in_progress` (retry after ~2 s), `502 order_not_created`, `503 test_checkout_disabled`.
- Quote window: a quote can be paid until `valid_at_send_until` (15 minutes plus the 2-minute send grace).
- The intent row is written before the Razorpay call. If Razorpay is slow or fails, the same quote is retried; after 15 seconds a pending intent can be taken over. The Razorpay `receipt` is derived from the intent id.

`POST checkout-status` → `{ intent_id, retry_key, razorpay_payment_id?, razorpay_signature? }`

- `200 { status, amount_paise, currency, razorpay_order_id, razorpay_payment_id, return_signature_valid, environment: "test" }`
- `404 not_found` when the intent id and retry key do not match. The retry key is the capability; there is no account check.
- Read-only. Sending `razorpay_payment_id` and `razorpay_signature` only adds a server-side signature verdict.

`POST verify-test-webhook` → Razorpay's body.

- `200` acknowledged (including duplicates and ignored events), `401 invalid_signature`, `400 invalid_payload`, `500 webhook_not_configured` or a storage failure.

## Test money

Razorpay test mode only; no real money moves. Card: any future expiry, random CVV. The mock bank page decides success or failure, and an OTP of 4–10 digits succeeds while fewer than 4 digits fails.

| Method | Value |
|---|---|
| Visa (consumer debit) | `4100 2800 0000 1007` |
| Mastercard (business credit) | `5555 5100 0008 1006` |
| RuPay (consumer credit) | `6527 6589 0000 1005` |
| UPI success | `success@razorpay` |
| UPI failure | `failure@razorpay` |

UPI cancellation in test mode can complete as a successful payment; that is a provider test quirk, not our flow.

## Running the scaffold with dummy env

Unit tests need no keys or network:

```bash
npx vitest run supabase/functions/_shared/razorpay.test.ts \
  src/services/testCheckout.test.ts \
  src/components/order/TestCheckout.test.tsx
```

The fixtures use the placeholder secret `whsec_test_EXAMPLE_only_not_a_secret`; their signatures are precomputed so the test proves exact-byte verification, not just a round trip.

Local functions (fill `supabase/functions/.env` with the placeholder names above; the values can be dummy for CORS/validation checks):

```bash
supabase functions serve create-test-order checkout-status verify-test-webhook \
  --env-file supabase/functions/.env
```

Curl shape against a local stack:

```bash
FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1
ANON_KEY=<local anon key>

curl -sS -X POST "$FUNCTIONS_URL/create-test-order" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"quote_id":"00000000-0000-4000-8000-0000000000dd","retry_key":"EXAMPLE_retry_key_0001"}'
```

A locally signed webhook, for checking verification without Razorpay:

```bash
SECRET='whsec_test_EXAMPLE_only_not_a_secret'
BODY='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_TEST00000000000001","amount":40900,"currency":"INR","order_id":"order_TEST00000000000001"}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -sS -X POST "$FUNCTIONS_URL/verify-test-webhook" \
  -H "Content-Type: application/json" -H "X-Razorpay-Signature: $SIG" -d "$BODY"
```

Test-project deploy (test project only):

```bash
supabase link --project-ref <test-project-ref>
supabase db push                 # applies the test scaffold migration
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy create-test-order
supabase functions deploy checkout-status
supabase functions deploy verify-test-webhook --no-verify-jwt
```

Add `VITE_TEST_CHECKOUT=true` to the preview/development environment, not to production. The button appears in the sent panel only when Send froze a priced quote; an unpriced order keeps the WhatsApp path. Any failure (function, script blocked, dismiss, unverified return) shows the WhatsApp fallback for the same message.

## What live needs (launch gates)

1. **Merchant and KYC.** Approved merchant account, business KYC including video KYC, PAN/GST details, verified settlement bank. Test keys cannot take money.
2. **Live keys and secrets.** Live key pair and a separate live webhook secret, set as Supabase secrets, rotated on a schedule and never in the repo. Test and live must not share a project by accident.
3. **Capture and methods.** Automatic capture (or an approved capture/expiry flow), accepted payment methods, international payments off unless approved.
4. **Finaliser.** One locked transaction per verified capture: one gateway receipt, one immutable quote snapshot, one active site order, one kitchen allocation. This replaces the WhatsApp-confirm gate for prepaid orders, which is a founder decision. Add reconciliation for lost webhooks and stuck creates, and alerting.
5. **Refunds.** Server-initiated full and partial refunds with an append-only ledger, cumulative cap under lock, admin approval and Undo-free audit history. The existing `order_payments` delete/restore Undo must not apply to gateway history.
6. **Compliance pages, five.** Terms, Privacy, Refund & Cancellation, Shipping & Delivery, and Contact, linked in the footer and reachable before payment. Add the FSSAI licence number and logo in the footer, plus GST invoice details and the business address. These are legal/brand inputs, not copy I can invent.
7. **Domains and return route.** Approved checkout/return domains on `https://www.shahsnutrition.food`, HTTPS return page, CORS allowlist, and a live webhook endpoint registered with the events above.
8. **Operations.** Who watches payment failures and refund exceptions, support wording, data retention, and a paid-but-unfulfillable refund path.

Not built here: kitchen order creation, refund API calls, partial-refund accounting, reconciliation jobs, admin payment/refund screens, customer-session binding for the pay call, abuse limits beyond the Slice A quote rate limit, and any UI outside the flagged button.

## Rollback

Set `VITE_TEST_CHECKOUT` unset/false and remove or unset `SLICE_B_TEST_CHECKOUT`. The functions answer 503, the button disappears, and the tables stay closed to browsers. Do not delete intents or events while a test payment might still resolve; they are the recovery record.
