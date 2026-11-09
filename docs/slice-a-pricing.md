# Slice A: pricing and WhatsApp quote

This document records the founder-locked Slice A contract and its current release limits. It is a plan, not proof that the features, database functions, provider setup or pricing are live. No online payment is part of Slice A: no Razorpay, gateway ledger or payment reservation. Orders continue to enter kitchen work only after Sunit confirms receipt of the WhatsApp message.

## Founder-locked customer experience

- Show each pack's real MRP crossed out and its actual **Your price** on product cards, the product popup and the cart. Use the same eligible price through preview and WhatsApp.
- Show eligible whole-rupee prices, not a public percentage ladder. Never show first- or second-order prices to a guest and never promise that every logged-in customer gets an extra discount.
- Guest-facing copy includes the login chip, healthy-habits login copy and the explanation that logging in is needed to confirm the first order. The guest cart remains orderable if login or OTP fails.
- Sign-in and delivery contact are distinct. Eligibility uses the verified customer session, not a typed delivery phone.
- No urgency, sale badge, invented discount, or price different from the server quote. Public prices are labels, not coupon descriptions; coupon-description validation against ₹, Rs and INR remains unchanged.

## Locked customer wording and presentation

- Products honesty line: “MRP is the price printed on the pack. Your price is what you actually pay, and it's lower.”
- Products login chip: “Log in for a bigger discount”; cart chip: “Log in”. Cart nudge: “Log in with your number and you may pay even less.” The word “may” is intentional for third-or-later customers.
- Login copy: “I'm so happy you're trying a healthier habit, and honestly that's the hardest part. Logging in with your number is the only way we can confirm your first order. We'll send you a code, and you're in.”
- Below 500 g for a weight-rule tier: “Add {X} g more and delivery's on us.” For the second-tier pack rule: “Add one more pack and delivery's on us.” Free row: “Delivery · Free”. Savings: “You save ₹X on this order.”
- MRP is small, muted and struck; “Your price” is larger, bold and ink. Savings and “Free” use success text, never the price. Screen readers get explicit “MRP” and “Your price” labels. No percentages, save text or extra badges on cards; no nudge on cards or in the product popup.

## Pack price table

Rates below are stored whole-rupee values; do not derive them by applying percentages at runtime. Pack order is Muesli 250/500 g, Raggi Jaggi 250/500 g, Date Bites 250 g (`bites`).

| Product and pack | MRP | Guest / third+ | First qualifying order | Second qualifying order |
|---|---:|---:|---:|---:|
| Muesli 250 g | ₹399 | ₹359 | ₹319 | ₹279 |
| Muesli 500 g | ₹699 | ₹629 | ₹559 | ₹489 |
| Raggi Jaggi 250 g | ₹249 | ₹224 | ₹199 | ₹174 |
| Raggi Jaggi 500 g | ₹479 | ₹431 | ₹383 | ₹335 |
| Date Bites 250 g | ₹319 | ₹287 | ₹255 | ₹223 |

Guest and third-or-later tiers share rates. The server owns eligibility and quote arithmetic; rates must not be reconstructed from an assumed percentage.

## Delivery contract

Delivery minima waive delivery only. They never withhold a price discount or block an order.

- Guest, first and third-or-later: free delivery at 500 g or more.
- Second qualifying order: free delivery at two or more packs. Identical packs and two sizes of one product both count as two.
- One parcel base fee: ₹50 at 1–250 g; ₹70 above 250 g. The fee is capped at ₹70 even above 500 g. This cap is an explicit temporary assumption until the founder supplies more bands; it is not a verified permanent rate.
- Do not invent remote-area or packaging surcharges.
- Empty paid cart has no delivery quote or nudge. Samples and out-of-stock lines do not count toward paid-pack weight or pack count.

## Server quote and privacy boundaries

`get_website_offer(apikey text default null)` (built, unreleased) returns one complete, expiring guest price version with matching MRPs and delivery rules. It contains only guest prices: no private coupon code/id, first/second-tier rates, phone or purchase history. A response is either ready with the complete offer or unavailable without a price payload. It is a catalogue read, not an order quote.

Authenticated `quote_website_order(p_code,p_lines,p_coupon default null)` (built, unreleased) binds a canonical cart, customer subject, coupon choice and price version into a short-lived quote. Verified phone comes only from the authenticated, confirmed Auth phone. Anonymous users remain guests even if a delivery phone was typed. Authentication results do not disclose purchase counts or history; `get_admin_coupon_uses` is not an eligibility source.

The server picks the lowest final payable whole-cart amount among eligible automatic offer, a checked ordinary coupon and MRP. It never stacks or chooses per-line winners; ties go to the automatic offer. Missing ordinary-coupon pack prices use MRP for those packs; a missing automatic-offer rate makes that automatic offer unavailable. The selected offer is named, and card/popup prices follow the selected price list through the quote's five-pack `catalogue`. Ordinary coupons do not independently grant free delivery based on marketing copy.

The quote includes a quote id, expiry and version; lines with product, size, quantity, grams, MRP, unit price and line total; MRP/items totals, savings, weight, pack count, delivery base/waiver/fee, final total and currency. The quote lifetime is 15 minutes, and sending within two minutes after expiry is still accepted (the send grace). The quote is a saved snapshot, not an instruction to re-read mutable prices later: the admin request and order carry it as `quote`, and a delivered bill prices from it.

## Send, failure and saved snapshots

Quote work happens before Send. Send freezes the matching, unexpired quote and message synchronously, then submits the quote id (not client totals) through the planned `submit_website_request_v2`. WhatsApp must open synchronously without waiting for the save, including on iOS. A valid-at-Send quote has a planned two-minute submission grace; duplicate submission by quote/code is repeat-safe. A retry with the same quote returns the same request, and a different payload cannot reuse it.

A missing RPC, 404, malformed/incomplete offer, timeout, offline state or expired quote must not silently send an MRP total after advertising a lower price. The UI may show a labelled MRP reference only, with crossed MRP, “Your price” and free-delivery claims hidden and Retry offered. Or it may explicitly send an **unpriced** WhatsApp message for manual confirmation, with no payable amounts. It must not fake a first-order result. OTP failure retains guest entitlement and explains that an extra offer could not be checked.

A successful quote's snapshot must survive later price edits and expiry. Preview, Send, retry, copy, saved request and admin confirmation use that same snapshot, including delivery and final total; confirmed `orders.amount` is the grand total. A save failure does not change the message: the quote/code is Sunit's recovery record, or the owner can explicitly enter the rates agreed in chat. Legacy requests remain for manual confirmation and must not receive an invented snapshot. Rollback disables new priced/auth UI but retains accepted quote records and safe confirmation; do not delete quote history or restore unsafe legacy priced Send behavior.

## Customer history and admin policy

The proposed meaning of “old” excludes pre-Slice-A launch orders. A fixed server rollout cutoff is required. Count confirmed, noncancelled post-cutoff purchases across all five sources with a matching normalized buyer phone; exclude no-phone, free-sample and any Gift-payment orders. Paid orders that contain sample tasters count once. Pending/dismissed requests and Send taps do not advance tiers; a post-launch guest order advances only when confirmed.

Zero qualifying purchases gives first tier; one gives second; two or more gives third+. Until payments exist, progression is confirmation-based, not a strict one-use redemption guarantee. Recheck under a per-phone lock at confirmation. If another confirmation advanced the tier, preserve the promised quote and show an explicit owner decision rather than silently repricing. Retries cannot create another purchase.

Site source is fixed server-side. Non-site source mappings (`whatsapp`, `call`, `in_person`, `instagram`) are not supplied: leave them visibly unconfigured with the existing Repeat fallback until the founder/PM provides mappings. Do not infer source from referrer or the last WhatsApp step. Existing saved snapshots/Edit remain fixed; explicit owner offer/removal wins; typed rate/total overrides require an audited reason and explicit delivery/adjustment so the bill balances. Legacy unquoted requests stay clearly separate.

## Release gates and unknowns

Do not claim customer OTP or tier discounts are ready until the approved India SMS provider, DLT requirements, costs, limits and settings are confirmed. Customer auth must be a separate lazy, memory-only Supabase client with a distinct storage key and `persistSession:false`; it must never replace admin auth. Resend, attempt, IP and phone limits plus generic errors and abuse protection are required.

Before enabling OTP tiers, the founder/PM must confirm the fixed history cutoff and whether a partly gifted order is excluded (the current proposal excludes any order with Gift payment). Non-site source-to-policy mappings also remain unknown. The ₹70-above-250-g cap is temporary. No live database, SMS provider, price readiness, implementation or browser behavior is asserted by this document.

No real coupon codes, phone numbers or email addresses belong in this repo. `EXAMPLE10` is the only permitted example coupon placeholder.
