# Parcelwise

A working local seller dashboard for choosing among three fictional delivery companies, with transparent ranking, simulated shipment tracking, and route-aware customer feedback.

## Run

Requires Python 3.10 or newer. No pip or npm installation is needed.

```sh
git clone https://github.com/Preethesh16/parcelwise.git
cd parcelwise
python3 server.py --port 8000
```

Open http://localhost:8000. The server listens only on the local computer. Use another `--port` if needed. Optional Google Fonts enhance typography; system fonts work offline.

## Try the complete flow

1. Start with Mumbai → Bengaluru and a 2 kg parcel. Compare the three companies.
2. Switch among Best match, Lowest price, Fastest, and Most reliable. Expand “Why this score?” to inspect normalized criteria and weights.
3. Select a partner to create a shipment. Its quoted price and recommendation metrics are saved as a snapshot.
4. In My shipments, advance tracking four times to Delivered.
5. Add the customer's delivery care rating, on-time outcome, and successful-delivery outcome.
6. Compare the same route again. Its new response count and updated performance appear immediately. Reloading or restarting preserves shipment and feedback records.

A fresh clone starts with an empty shipment history. All quotes and activity are simulated.

## What works

- Eight supported Indian cities, actual and volumetric parcel weight, route and weight eligibility, explicit exclusion reasons, and empty-state handling.
- Deterministic INR quotes with carrier-specific deals applied before ranking.
- Four ranking priorities; normalized price, speed, reliability, and care-quality signals. The in-app method page documents formulas and all weights.
- Reliability is 60% on-time rate and 40% successful-delivery rate.
- A baseline equivalent to 40 simulated historical deliveries prevents a single review from dominating. Matching directional routes get full feedback weight; other routes get 20% weight.
- SQLite persistence in `data.sqlite3`. Set `PARCELWISE_DB` to choose another database file. A new database is initialized automatically.
- One feedback response per delivered shipment, server-side validation, shipment tracking, responsive layouts, and keyboard-accessible native forms/dialogs.

## Verify

```sh
python3 -m unittest discover -v
node --check static/app.js  # optional, requires Node
```

Five automated tests cover priority rankings and deals, route/volumetric eligibility, invalid data, the booking-to-feedback lifecycle and persistence, feedback smoothing and route weighting, duplicate/early feedback rejection, and unknown shipments. Tests use a temporary isolated database and HTTP server.

Browser verification covered booking, all tracking stages, saving feedback, seeing updated recommendations, and mobile viewport overflow at 390 px.

## Limitations

This is a local single-workspace demo, not a production deployment. A/B/C are delivery companies, not individual couriers. Quotes, historical data, distances, and tracking are simulated. There are no real carrier bookings, payments, notifications, authentication, precise addresses, or postcode-level service checks. Customer feedback is entered through a seller-accessible demo form; production would need authenticated or signed recipient links, verified carrier outcomes, fraud controls, and real integrations. Calendar-day estimates are simplified and are not shipping promises.

## Files

- `server.py`: standard-library HTTP API, pricing/ranking, SQLite persistence.
- `static/`: responsive application UI.
- `test_server.py`: isolated integration and scoring checks.
