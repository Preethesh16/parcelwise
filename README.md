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

1. Enter From, To, and Weight. Expand Parcel size to adjust the visible default measurements.
2. Click Find delivery partners. Compare total price, arrival time, on-time delivery rate, and parcel care. One partner is recommended with a plain-language reason.
3. Optionally use Sort by to prioritize price, speed, or reliability, then choose a partner.
4. In My deliveries, expand Try demo tracking and move the parcel through the four stages to Delivered.
5. Open customer view. This separate page shows only that parcel's journey, a refresh control, and a feedback button after delivery.
6. Submit care, on-time, and successful-delivery feedback. Future comparisons incorporate the outcome, with historical smoothing.

The interface follows [Accord](https://github.com/Preethesh16/accord)'s guided requirements → recommended option → outcome pattern. Seller navigation has just two choices. Ranking formulas are available behind a secondary explanation link.

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

Six automated tests cover priority rankings and deals, route/volumetric eligibility, invalid data, the booking-to-feedback lifecycle and persistence, feedback smoothing and route weighting, duplicate/early feedback rejection, and unknown shipments, and the individual customer tracking response. Tests use a temporary isolated database and HTTP server.

Browser verification covered booking, all tracking stages, saving feedback, seeing updated recommendations, and mobile viewport overflow at 390 px.

## Limitations

This is a local single-workspace demo, not a production deployment. A/B/C are delivery companies, not individual couriers. Quotes, historical data, distances, and tracking are simulated. There are no real carrier bookings, payments, notifications, authentication, precise addresses, or postcode-level service checks. The separate customer view is a demo presentation, not an authorization boundary. Its local URL only works on the machine running the server. Production would need authenticated sellers, signed recipient links, verified carrier outcomes, fraud controls, and real integrations. Calendar-day estimates are simplified and are not shipping promises.

## Files

- `server.py`: standard-library HTTP API, pricing/ranking, SQLite persistence.
- `static/`: responsive application UI.
- `test_server.py`: isolated integration and scoring checks.
