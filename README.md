# Parcelwise × Everyday

Three connected experiences: an Everyday ecommerce shop, a seller workspace, and individual courier workspaces. Confirming a shop order starts policy-bound negotiation, automatic partner selection, a simulated contract and escrow transfer, then accelerated map tracking. Customer receipt confirmation releases the delivery payment; reviews update the shared order history.

## Run

Python 3.10+; no pip or npm dependencies.

```sh
python3 run_demo.py
# If port 8000 is occupied:
python3 run_demo.py --store-port 8010 --api-port 8001
```

| Experience | Default link |
|---|---|
| Landing | http://localhost:8000/ |
| Everyday shop | http://localhost:8000/shop |
| Seller | http://localhost:8001/#login=seller |
| Courier | http://localhost:8001/#login=partner |

The storefront appearance and products are retained from main. Both services bind only to loopback. Alternate ports update store/API links automatically. Existing databases are retained on startup.

### Local credentials

Choose the account on the sign-in screen and enter its access key.

| Account | Access key |
|---|---|
| Everyday seller | `demo-company-key` |
| Blue Dart | `demo-partner-A-key` |
| Delhivery | `demo-partner-B-key` |
| Shiprocket | `demo-partner-C-key` |
| Ekart Logistics | `demo-partner-D-key` |
| FedEx | `demo-partner-E-key` |

These are shared local demo accounts. The named courier profiles simulate services and do not connect to or represent the actual companies. Sessions use HttpOnly, SameSite cookies, expire after eight hours or server restart, and are scoped by account so seller and courier tabs can remain signed in simultaneously. Courier APIs restrict assignments, configuration, and analytics to the authenticated courier.

## Connected workflow

1. Everyday saves the confirmed checkout in its own SQLite database and sends an authenticated order event to Parcelwise. Retries are idempotent. The customer opens a token-authorized journey without business login.
2. Saved seller and courier policies filter route coverage, weight, handling, reliability, budget, and deadline. Customer requirements cannot be relaxed.
3. Seller and courier agents exchange three rounds of proposals. The server validates bounds and ranks eligible offers by the seller's selected priority.
4. The chosen courier and agreed price, duration, and savings are shown for seven seconds before contract creation.
5. Contract terms are immutable. The ledger debits the seller and funds escrow exactly once. Insufficient funds or no suitable offer stop the flow for seller review.
6. A durable worker advances the simulated route through pickup, transit, near-door, and arrived. It continues without an open browser and resumes after restart. Business transit days are shown separately from the seconds-long animation.
7. Customer confirmation releases escrow once; a delivery issue holds payment for seller resolution. One rating and optional written review can be submitted after delivery.
8. Seller and courier screens refresh from the same persisted order state. Accepted deals and pre-existing orders retain their terms. Older manual-review orders remain supported.

Money, contracts, carrier operations, and GPS positions are simulated. The map uses Leaflet/OpenStreetMap city-level points, not real road routes. Map attribution remains visible; missing tiles do not disable status updates.

## Workspaces and analytics

Seller navigation: Overview, Orders, Analytics, Partners & rules.
Courier navigation: Overview, Orders, Analytics, Agent rules.

Orders include items, customer and seller details, courier, negotiated price, delivery promise, tracking, actual simulated transit, delays, and feedback. Search and paginated history keep long datasets usable.

Seller analytics filters by courier company, date range, status, and placed/sample orders. Courier analytics is restricted to that account. Reports include:

- On-time rate, average transit, shipping spend or courier earnings, ratings and sample counts.
- Interactive weekly volume, on-time and rating trends, with hover/focus values and a readable data table.
- Courier comparisons sorted by on-time rate, customer rating, or volume.
- Rating distribution, route performance, and delay/rating bubble plots.
- Pearson correlation only when at least ten paired observations and nonzero variance exist; association is not causation.

750 reproducible synthetic deliveries across five couriers populate approximately 180 days of history. Seeding is versioned and idempotent; sample orders never move current wallet balances. Source filters and an “includes sample history” label distinguish them from placed orders. Missing timing is unknown and excluded from on-time denominators; unrated orders are excluded from rating averages. Old records are never assigned invented timings.

## OpenAI negotiation

Set `OPENAI_API_KEY` in the server environment before starting. With a key, the default mode is OpenAI; otherwise it is explicitly labelled local policy simulation. `PARCELWISE_AI_MODE=openai` requires a key; `local` forces offline operation. `OPENAI_MODEL` defaults to `gpt-4.1-mini`.

The existing Responses API adapter uses strict structured outputs, bounded integer-paise proposals, and separate seller/courier requests. Up to five courier conversations run concurrently; successful proposals are cached persistently so a partial retry does not repeat them. Provider failures never silently fall back or move money. Failed negotiations can be retried from the seller order screen.

Only logistics data and policy constraints are sent: city pair, weight, budget, deadline, handling, prior offers. Customer names, street addresses, and tracking tokens are excluded. The API request uses `store=false`. Keys are read only by the server and must never be placed in frontend code, Git, screenshots, or progress notes.

## API and persistence

- `POST /api/v1/orders`: company-key confirmed-order ingestion, HTTP 202, durable automatic dispatch.
- `GET /api/v1/orders/{id}`: authenticated seller or assigned-courier detail.
- `GET /api/platform`: role-scoped shared workspace data.
- `GET /api/analytics?partner=A&from=YYYY-MM-DD&to=YYYY-MM-DD&source=synthetic&status=completed`: role-scoped metrics; omitted filters include all eligible records.
- `GET /api/tracking/{token}`: customer journey state.
- `POST /api/tracking-action`: token-authorized receipt, dispute, or feedback.
- `POST /api/connections`: account-owned policy changes.
- `POST /api/demo/order-action`: seller recovery and older manual-review actions.
- `POST /api/demo/partner-action`: assigned-courier sequential tracking updates.
- `POST /api/integrations/delivery`: partner-key authenticated tracking event.
- `POST /api/login`, `POST /api/logout`, `GET /api/session`: local portal sessions.

`data.sqlite3` stores delivery orders, policies, contracts, wallets, ledger, cached proposals and dataset versions. `store.sqlite3` stores confirmed checkout payloads and retry results. Both are ignored by Git. Money is integer paise. Funding/release entries have unique order/action constraints.

Environment overrides: `PARCELWISE_DB`, `EVERYDAY_DB`, `PARCELWISE_API_URL`, `PARCELWISE_PUBLIC_URL`, `EVERYDAY_PUBLIC_URL`, `PARCELWISE_COMPANY_KEY`. Changing a company integration key requires matching the storefront environment.

## Verification

```sh
python3 -m unittest -q
node test_workspace.js
node test_journey.js
node --check static/dashboard.js
node --check static/journey-view.js
```

Tests cover automatic and legacy workflows, restart recovery, escrow conservation/idempotency, source preservation, synthetic seeding, analytics fixtures, all-five-courier session isolation, policy boundaries, AI response validation and proposal-cache recovery. See [progress.md](progress.md) for current browser evidence and remaining checks.

Production identity, real carrier APIs, real payments and deployed blockchain contracts are outside this local demo.
