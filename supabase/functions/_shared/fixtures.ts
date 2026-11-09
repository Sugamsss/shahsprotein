/**
 * Dummy webhook fixtures with signatures computed over the exact bytes below.
 * The secret is a placeholder that matches nothing real: these pin the
 * algorithm, not a provider. Do not replace it with a real webhook secret.
 */

export const DUMMY_WEBHOOK_SECRET = 'whsec_test_EXAMPLE_only_not_a_secret';

export interface WebhookFixture {
  eventId: string;
  rawBody: string;
  signature: string;
  bodySha256: string;
}

export const capturedWebhook: WebhookFixture = {
  eventId: 'evt_TEST_captured_001',
  rawBody: "{\n  \"entity\": \"event\",\n  \"account_id\": \"acc_TEST00000000000001\",\n  \"event\": \"payment.captured\",\n  \"contains\": [\n    \"payment\"\n  ],\n  \"payload\": {\n    \"payment\": {\n      \"entity\": {\n        \"id\": \"pay_TEST00000000000001\",\n        \"entity\": \"payment\",\n        \"amount\": 40900,\n        \"currency\": \"INR\",\n        \"status\": \"captured\",\n        \"order_id\": \"order_TEST00000000000001\",\n        \"method\": \"card\",\n        \"captured\": true\n      }\n    }\n  },\n  \"created_at\": 1762560000\n}",
  signature: '569d59bf2392284ec97f80afbebcc563fe6f38aef0f23bb10f4f1dc71347ee3b',
  bodySha256: '7e2dd6d2cea8efd68409de79b7b98d15984fd41ba86015d8905e481fdbe029a0',
};

export const failedWebhook: WebhookFixture = {
  eventId: 'evt_TEST_failed_001',
  rawBody: "{\n  \"entity\": \"event\",\n  \"account_id\": \"acc_TEST00000000000001\",\n  \"event\": \"payment.failed\",\n  \"contains\": [\n    \"payment\"\n  ],\n  \"payload\": {\n    \"payment\": {\n      \"entity\": {\n        \"id\": \"pay_TEST00000000000002\",\n        \"entity\": \"payment\",\n        \"amount\": 40900,\n        \"currency\": \"INR\",\n        \"status\": \"failed\",\n        \"order_id\": \"order_TEST00000000000001\",\n        \"method\": \"upi\",\n        \"error_code\": \"BAD_REQUEST_ERROR\",\n        \"error_description\": \"Payment failed (test fixture)\"\n      }\n    }\n  },\n  \"created_at\": 1762560100\n}",
  signature: 'd4ad6830fabfd51440b315e643fdae9ab713bd6742f7f47fc499c3e5a295ead3',
  bodySha256: '38760eb55493277127523c79ac8e736806fa104713fbdaa5da9d27078dc56944',
};

export const refundedWebhook: WebhookFixture = {
  eventId: 'evt_TEST_refunded_001',
  rawBody: "{\n  \"entity\": \"event\",\n  \"account_id\": \"acc_TEST00000000000001\",\n  \"event\": \"refund.processed\",\n  \"contains\": [\n    \"refund\"\n  ],\n  \"payload\": {\n    \"refund\": {\n      \"entity\": {\n        \"id\": \"rfnd_TEST00000000000001\",\n        \"entity\": \"refund\",\n        \"amount\": 40900,\n        \"currency\": \"INR\",\n        \"payment_id\": \"pay_TEST00000000000001\",\n        \"status\": \"processed\",\n        \"speed_processed\": \"normal\"\n      }\n    }\n  },\n  \"created_at\": 1762560200\n}",
  signature: '74ae254f2b9fe354a5d7a1fc0fe4aa6965711f7fd4d5276956f3578af2ab195a',
  bodySha256: '4b93326f0cf1c53cc99aefa466b42a5f25ce6d4cc5ea6fef05028e4e85032ab9',
};

/** The captured fixture with one digit changed: the signature must fail. */
export const tamperedCapturedBody = capturedWebhook.rawBody.replace('"amount": 40900', '"amount": 4900');

/** The captured fixture re-serialised: different bytes, same JSON. */
export const reserialisedCapturedBody = JSON.stringify(JSON.parse(capturedWebhook.rawBody));
