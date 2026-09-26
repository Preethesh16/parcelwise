# Parcelwise × Everyday

An end-to-end ecommerce-to-delivery demo. Confirm a store order and Parcelwise parses the shipment, broadcasts a request to local partner agents, negotiates within their policies, chooses a deal, and locks the shipping payment in simulated escrow. Customer-confirmed delivery releases it to the chosen partner.

**Simulation only:** no real purchases, carrier calls, LLM calls, wallet connections, blockchain deployment, or real money. Agents are deterministic policy agents. The escrow contract is a persistent local state machine, not an on-chain smart contract or a fully trustless system.

## Run

Python 3.10+; no pip or npm dependencies required.

```sh
git clone https://github.com/Preethesh16/parcelwise.git
cd parcelwise
python3 server.py --port 8000
```

Open [the storefront](http://localhost:8000/#shop), [delivery platform](http://localhost:8000/#platform), or [connections](http://localhost:8000/#connections). The server binds to `127.0.0.1`. Optional Google Fonts have local fallbacks.

## Walk through the demo

1. **Shop:** choose The Weekender, Daybreak Bottle, or Evening Light. Enter a sample recipient and supported address. Confirm the demo order; no card is needed.
2. **Order confirmed:** the storefront constructs a confirmed order event using authoritative product measurements and the configured company warehouse. It invokes the same ingestion service as the integration endpoint.
3. **Automatic dispatch:** the parser extracts seller/customer addresses and item quantities, weights, and dimensions. It assumes one parcel, with items stacked vertically: max length/width, summed height, summed weight. Volumetric weight is volume / 5,000.
4. **Negotiation:** three local carrier agents receive route and parcel details. Eligible agents offer an opening price, a midpoint concession, and their final allowed price. The company agent requests improvements between rounds. No carrier goes below its floor or beyond its maximum discount. Each maintains its configured transit promise.
5. **Selection and escrow:** only offers meeting the company's shipping budget and deadline qualify. Normalized price, speed, reliability, and quality select the winner. A simulated contract stores immutable terms and a SHA-256 terms hash. Company → escrow movement and order creation are one SQLite transaction.
6. **Follow delivery:** open the order in Delivery platform. Expand **Try the delivery demo** to simulate pickup, transit, out-for-delivery, and reported delivery. Expand negotiation or activity to inspect what happened.
7. **Customer proof:** open **customer tracking**. The customer confirms receipt to release escrow, or reports an issue to hold payout. A partner report alone cannot release payment.
8. **Settlement:** company, escrow, and partner balances update together with an append-only application transaction history. Refresh or restart to verify persistence.
9. **Feedback:** the customer records care, timeliness, and successful receipt. Future quotes use this feedback, with route weighting and historical smoothing.

The delivered workspace may contain a completed sample order from browser verification. A fresh clone starts with no orders and ₹10,000 simulated company credits.

## Connections and policy controls

**Company:** warehouse street/city/PIN, company name, shipping budget, delivery deadline, ranking priority, and sandbox webhook key.

**Partners A/B/C:** connected/paused, minimum price, maximum concession, transit promise, weight policy, excluded cities, and sandbox delivery-event key. The initial three companies have built-in coverage/weight limits too: A 25 kg; B 15 kg and no Jaipur; C 30 kg and no Kolkata. A stricter configured limit wins.

Changing policy affects future orders. Accepted contract terms and prices do not change. The demo supports one company and three pre-onboarded partner companies; it does not model individual couriers or multi-tenant accounts.

Sandbox keys authenticate **incoming** order or delivery-event requests. They are stored as SHA-256 hashes, omitted from read APIs, and can be replaced in Connections. These are not outbound credentials for real carrier services. Use only demo keys here.

## Integration endpoint

Amounts in API payloads and the ledger are integer **paise**. UI displays INR-formatted demo credits. `unitPrice` is the merchandise unit price, separate from shipping.

```sh
curl http://localhost:8000/api/integrations/orders \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: demo-company-key' \
  --data-binary @static/api-example.json
```

See [the example payload](static/api-example.json). `orderId` is the idempotency key. Identical retries return the same order, customer token, and status with `duplicate: true`; a reused ID with different payload details is rejected. Both storefront and webhook orders use the same ingestion implementation. Missing measurements and unsupported addresses return a validation error before any funds move.

For the selected carrier, send each tracking stage explicitly:

```sh
curl http://localhost:8000/api/integrations/delivery \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: demo-partner-B-key' \
  -d '{"orderId":"REPLACE_WITH_ORDER_ID","partnerId":"B","stage":1}'
```

Stages: 1 pickup, 2 transit, 3 out for delivery, 4 reported delivered. Use the actual winning partner and its corresponding key. Stage replays are no-ops; skipping a stage is rejected. Wrong partner credentials or a non-winning partner cannot update the delivery.

Initial demo keys: `demo-company-key`, `demo-partner-A-key`, `demo-partner-B-key`, `demo-partner-C-key`. After rotation, old keys stop working. The built-in store uses the internal ingestion service rather than a loopback HTTP request, so its checkout doesn't depend on the sandbox webhook key.

## Escrow rules and failure states

| Event | Result |
|---|---|
| No eligible offer / budget or deadline unmet | Needs attention; no contract funding or wallet debit |
| Insufficient company credits | Contract created but unfunded; tracking disabled; funding can be retried |
| Accepted deal with sufficient credits | Company debited once; same amount held in escrow |
| Partner reports delivery | Awaiting customer; amount remains held |
| Customer confirms receipt | Escrow released exactly once to selected partner |
| Customer reports an issue before payout | Disputed; funds held and confirmation no longer releases them |
| Company refunds disputed or expired contract | Held amount returns to company exactly once |
| Repeated order / stage / settlement request | Idempotent; no duplicated charge or payout |

A delivery deadline includes a two-day grace period. An expired funded contract may be refunded by an explicit demo action; there is no scheduler automatically processing expirations. Dispute resolution/refund is performed by the local demo operator. Completed payout cannot be refunded by this simulator. Merchandise refunds are outside this delivery-payment demo.

## Ranking and feedback

Price utility = `1 / (1 + shipping_price_paise / 25000)`; speed utility = `max(0, 1 - (days - 1) / 6)`. Reliability = 60% on-time + 40% successful deliveries. Care rating 1–5 maps to 0–1.

| Company priority | Price | Speed | Reliability | Care |
|---|---:|---:|---:|---:|
| Balanced | 35% | 25% | 25% | 15% |
| Price | 80% | 10% | 5% | 5% |
| Speed | 15% | 65% | 10% | 10% |
| Reliability | 10% | 10% | 55% | 25% |

A baseline equivalent to 40 historical simulated deliveries prevents one review from dominating. Matching directional-route feedback counts fully; other routes count 20%. Initial carrier offers also include seeded deals. The negotiated concession is applied within each carrier's policy.

## Verify

```sh
python3 -m unittest discover -v
node --check static/app.js  # optional syntax check; requires Node
```

21 tests cover the quote engine, parsing, checkout-to-payout, money conservation, concurrent duplicate orders, no-deal and insufficient-funds paths, API authentication and key rotation, non-winning partners, stage replay, persistence, disputed/expired refunds, immutable accepted terms, early/duplicate feedback rejection, and route-aware feedback.

Browser verification covers store checkout, automatic selection/escrow, all delivery stages, customer receipt and payout, feedback, and saving company/partner policy. Store and platform layouts are checked at mobile and desktop widths.

## Storage and project layout

- `server.py`: standard-library HTTP API and original quote/feedback engine.
- `workflow.py`: order parser, company/partner policies, negotiation, contracts, wallets, and ledger.
- `static/`: storefront, platform, connections, customer tracking, and example webhook payload.
- `test_server.py`, `test_workflow.py`: isolated tests using temporary databases.
- `data.sqlite3`: generated local state, excluded from Git. `PARCELWISE_DB` selects another database path. Use a new path to start a separate clean demo without deleting existing data.

## Production boundary

This is a local single-workspace demo. There is no company/admin sign-in, tenant separation, production carrier connection, real checkout payment, or deployed smart contract. Customer links use random bearer tokens; those authorize simulated confirmation and feedback, but local platform administration can see them. Do not expose this server publicly or enter production credentials.

A real system needs authenticated company/partner accounts, approved carrier adapters, secure credential storage, durable event delivery and workers, independently verified delivery proofs and a dispute policy, plus deployed/audited escrow contracts and actual wallet signatures. Blockchain escrow alone cannot verify a parcel's physical arrival: the delivery oracle or attestation model remains a trust dependency.
