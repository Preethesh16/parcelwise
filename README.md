# Parcelwise

A local ecommerce-to-delivery demo with an automatic delivery lifecycle.

## Run

Python 3.10+; the app needs no pip or npm packages.

```sh
python run_demo.py --store-port 8002
```

- Landing: http://localhost:8002/
- Customer demo shop: http://localhost:8002/shop
- Seller dashboard: http://localhost:8001/#platform
- Delivery partner dashboard: http://localhost:8001/#partner=A
- Seller defaults: http://localhost:8001/#connections

The original truck/video landing page is the entry point. Choose **Seller login** or **Delivery partner login** to sign in, then enter the corresponding workspace. The brand link returns home and Sign out clears the session. Direct portal links also require sign-in.

Local demo access keys: seller (`Everyday Store`): `demo-company-key`; Fedx: `demo-partner-A-key`; Delhivery/Shiprocket use `demo-partner-B-key` / `demo-partner-C-key`. These are intentionally shared demo credentials, shown on the sign-in screen. Sessions expire after eight hours or a server restart, and use HttpOnly, SameSite=Strict cookies. Partners see only their assignments and cannot perform seller actions. Public customer tracking remains token-based. Do not deploy these demo accounts publicly.

Demo carrier login pages: Fedx (`/#login=A`), Delhivery (`/#login=B`), Shiprocket (`/#login=C`) on port 8001. Their keys remain `demo-partner-A-key`, `demo-partner-B-key`, and `demo-partner-C-key`. These names represent simulated demo carriers only.

## Product flow

1. The customer chooses a product, address, delivery deadline, and handling requirements. Lamps always require fragile handling.
2. The shop saves the confirmed order and sends it to Parcelwise. The customer stays on an order-confirmation screen with the entered address and a tracking link; the seller dashboard receives the new order.
3. The server automatically begins negotiation using saved shipping budget, deadline, minimum reliability, handling and ranking priority, constrained by the customer’s requirements. The conversation and shortlist appear in Current orders.
4. Seller and partner policy agents exchange opening offers and two counteroffer rounds. Coverage, volumetric weight, partner availability, fragile handling, and minimum reliability filter candidates. Budget and deadline filter final offers.
5. The seller sees a ranked shortlist with negotiated cost, delivery promise, fit score, profile reliability, and review counts. The recommended partner is the highest-ranked eligible offer. For new demo orders, the server automatically selects the recommended eligible offer after showing the negotiation. It then creates the contract and funds simulated escrow exactly once.
6. After selection, a persisted worker creates the contract and funds simulated escrow once. The chosen partner sees the assignment, seller, constraints and agreed terms.
7. The demo worker reports simulated pickup, transit, out-for-delivery, and delivery in sequence with visible pauses between stages. The seller's map shows each reported stage. The customer page refreshes automatically.
8. After delivery, the demo worker simulates recipient confirmation and releases escrow. This is labelled as a simulation, never a real customer confirmation. No rating or feedback is invented. Completed orders disappear from Current orders and remain in Analytics history.
9. Partner history and rating charts reflect actual demo orders. Feedback updates the profile estimates used by future negotiations.

Existing booked orders retain their agreed terms. New orders start negotiation automatically using saved shipping defaults. New demos automatically select the best eligible partner and advance through simulated delivery and receipt. Polling does not replay or reset completed deliveries.

## Constraints and ranking

| Constraint | Enforcement |
|---|---|
| Seller shipping budget | Final price cannot exceed the budget |
| Delivery deadline | Uses the stricter seller/customer deadline |
| Route coverage | Checks built-in service area and configured exclusions |
| Parcel weight and dimensions | Uses the greater of physical weight and volume / 5,000 |
| Reliability floor | Candidates must meet the seller's percentage threshold |
| Fragile handling | Customer requirements cannot be relaxed by the seller |
| Partner policies | Availability, price floor, maximum discount, transit promise and weight limit |

Eligible offers use normalized price, speed, reliability, and parcel-care scores. The seller chooses balanced, cost, speed, or reliability priority. Feedback estimates use historical demo priors equivalent to 40 deliveries; same-route reviews have full weight and other routes 0.2 weight. Review counts are displayed so estimates are not mistaken for observed customer-rating averages.

## Dashboard design

Seller: four KPI cards, order pipeline bars, partner assignment bars, searchable and filterable orders, and one focused order detail screen.

Partner: assigned work, active deliveries, rating distribution, profile settings, completed history, and customer comments. Each carrier has a separate login and dashboard. Sign in to separate tabs to keep the seller and carrier workspaces open together.

Negotiation transcripts, parcel addresses and history are expandable. Charts are native HTML/CSS in a Power BI-inspired style, not an embedded Microsoft Power BI report.

## Demo boundaries and production plan

Negotiation supports OpenAI Responses API proposals or explicitly labelled local policy agents. With OPENAI_API_KEY set, new negotiations use OpenAI by default. Set PARCELWISE_AI_MODE=local to force the offline demo, or openai to require live AI (missing credentials then block negotiation). OPENAI_MODEL defaults to gpt-4.1-mini and can be overridden. Restart the server after changing environment variables. Never put the key in frontend code, Git, or chat.

Seller and partner agents make separate structured-output requests for each eligible partner in each of three rounds (up to 18 calls for three partners). Only route cities, parcel weight, delivery policies and proposals are transmitted, not customer names, street addresses or tracking tokens. Responses are not stored by the API (store=false); provider abuse-monitoring policies still apply. Price proposals are validated against server-enforced bounds. Transit times and ranking remain deterministic. Failed/invalid calls stop negotiation with a retry message; they never silently switch to local proposals or select a partner. An in-flight failed round may incur API charges when retried. New automatic demos select the highest-ranked eligible offer after all rounds.

To enable live proposals, set OPENAI_API_KEY securely in the server environment, optionally OPENAI_MODEL, then run `python run_demo.py`. The order constraints form displays the active mode. Without credentials the default remains a labelled local simulation. Implementation follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

The delivery map uses Leaflet and OpenStreetMap tiles with simulated city-to-city positions, not live courier GPS. Funds and escrow are local demo credits, not real payments or blockchain transactions.

The seller and partner workspaces use **local shared demo access-key sign-in**, not production identity. Browser portal APIs enforce session roles and partner assignment checks. There is one seller account, no public registration or password recovery, and legacy shipment simulation endpoints remain available. Both servers bind to 127.0.0.1. Production requires individual accounts, stronger credential policies, HTTPS, comprehensive API authorization and tenant isolation.

The implemented workflow provides a foundation for these production increments:

1. Identity and ownership: seller and carrier sign-in, tenant-scoped order queries, role checks, audit history and session protection.
2. AI operations: configure the implemented OpenAI adapter, spending limits, production evaluation, retry budgets and per-tenant rate limits. Keep hard constraints, offer validation, seller approval and money movement deterministic.
3. Carrier integration: real quotes, serviceability by postal code, capacity, pickup windows, insurance, cash-on-delivery support, returns and shipment booking. Add offer expiry and revalidation at selection.
4. Tracking and proof: signed carrier webhooks, GPS/route providers, delivery ETA, proof of delivery and notifications.
5. Analytics and operations: measured on-time outcomes, dispute resolution, review moderation, retention policies, monitoring and an optional Power BI dataset/report integration.

These production services require provider credentials, carrier agreements and deployment configuration; they are not claimed to be connected in the local demo.

## API and persistence

The demo uses independent SQLite databases: store.sqlite3 for checkout retries and data.sqlite3 for orders, wallets, shipments and feedback.

- POST /api/v1/orders — authenticated confirmed-order ingestion; returns 202 and an awaiting_seller order.
- POST /api/integrations/orders — compatibility ingestion; also waits for seller approval.
- GET /api/platform — local demo dashboard.
- GET /api/v1/orders/{id} — local demo order details.
- POST /api/demo/order-action — negotiate, select, fund, refund or legacy demo advance.
- POST /api/demo/partner-action — selected-partner stage update for the local workspace.
- POST /api/integrations/delivery — partner-key authenticated stage update.
- GET /api/tracking/{token} — customer delivery view.
- POST /api/tracking-action — token-checked confirmation, dispute or feedback.
- POST /api/connections — local demo configuration.

Order IDs are idempotency keys; changed payloads with reused IDs are rejected. Selection is persisted atomically, repeated same-partner selection is a no-op, a different second selection is rejected, and contract funding cannot double-debit. Delivery updates must be sequential. Existing customer-token and partner-key checks remain enforced.

Incoming integration keys: demo-company-key and demo-partner-A-key / B-key / C-key. They are stored hashed. Local sign-in validates the same keys and issues an opaque session cookie; browser portal requests use that cookie. The store sends its company key server-to-server.

Environment: PARCELWISE_DB, EVERYDAY_DB, PARCELWISE_API_URL, PARCELWISE_PUBLIC_URL, PARCELWISE_COMPANY_KEY. Defaults target the two local servers. A failed store handoff preserves the order; retrying the same checkout safely resends the original event.

## Verification

```sh
python -m unittest test_workflow test_split_flow test_server test_seller_flow test_negotiation_ai
node --check static/workspace.js
node --check storefront/app.js
node test_workspace.js
```

Tests use isolated databases. They cover approval boundaries, alternative partner selection, retries, no-match handling, customer constraints, policy floors, ledger conservation, selected-partner delivery events, confirmation and feedback affecting later rankings.

## Automatic demo and Gmail confirmation

New orders store `autoDemo=true`. The persisted server worker runs negotiation, selects the recommended eligible carrier, creates the contract, funds escrow, advances delivery stages, simulates receipt and releases escrow. Each stage has a visible pause. No browser needs to remain open. No-match and insufficient-funds states stop with an explanation. No fake customer rating is generated.

Partner selection creates one persistent confirmation email for `abhinavshetty0504@gmail.com`, containing the order reference, carrier, agreed shipping price, route and delivery promise. It clearly identifies the booking and payments as a demo. Email runs on a separate worker and never blocks delivery.

To use Gmail as the sender, enable Google 2-Step Verification and create an app password (https://support.google.com/mail/answer/185833). Run `python3 setup_gmail.py` in this repository and enter the app password at the hidden terminal prompt. Restart `python3 run_demo.py --store-port 8002`. The credential stays in Git-ignored `.env`, with owner-only file permissions. Never paste it into chat.

Without sender configuration, confirmations remain queued and the dashboard says sender setup is needed. SMTP failures are reported; ambiguous submissions are not automatically retried to avoid duplicates. A `sent` status means the SMTP server accepted the message, not guaranteed inbox placement.

Verification: `python3 -m unittest test_automatic_demo test_workflow test_split_flow test_seller_flow test_negotiation_ai test_portal_sessions` and `node test_workspace.js`. Email tests mock SMTP and do not send real emails.

### Synthetic business intelligence demo

The seller Analytics page loads `static/data/synthetic_orders.json`: 12,000 fictional historical orders across October 2024–September 2026, with 31 fields and seed 16102026. CSV and field definitions are available directly in the dashboard under Full dataset and Data dictionary. This data is isolated from SQLite orders, wallets, bookings, and emails. Carrier differences are simulation assumptions, not measurements of real carrier performance.

Use date presets and combined partner, destination, region, category, service, payment, outcome, weather, and handling slicers. All ten visual panels, KPIs, the carrier scorecard, correlation explorer, and detail table follow the selected cohort. Click carrier bars, city heatmap cells, or product bars to drill down; Reset clears filters. Export filtered CSV exports the entire matching cohort, not just the current table page. Pearson correlation excludes missing pairs; scatter dots are sampled while its statistic uses all valid pairs. On-time rate uses delivered orders only; unrated orders do not count toward average ratings.

The automatic order demo pauses for contract creation and escrow funding, then advances delivery milestones every 5 seconds, with 3.5 seconds between negotiation messages. Auto-follow smoothly brings each new stage into view and can be toggled off. The delivery map is retained during refreshes rather than recreated, and reading older negotiation messages no longer forces the chat to its bottom.

Validation: `node test_analytics.js`, `node test_workspace.js`, and `python3 -m unittest discover -v`.
