# Smart Factory — PLC Monitoring Dashboard · Roadmap & Progress

Living tracker against the 18-phase roadmap. Legend:
**✅ Done** · **🟡 Partial** · **🔴 Pending**

> **Where we are right now (one line):** the full app is built and proven on *synthetic*
> simulator data (Phases 3–13 largely ✅), and the ingestion endpoint now matches the real
> **v1 contract** the company uses (auto-registers new machines/fields, API-key auth,
> verify endpoint). The remaining step to actually *receive* real data (Phase 2) is
> operational: deploy publicly + hand the company the key. Forward work after that:
> Phases 14–18 (alerts, real user login, optimization, load test, deploy).

---

## Phase status

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 1 | Requirement Gathering | 🟡 | Business metrics, update frequency (3s), and 12-dept pipeline known. **Unknown from company:** real PLC type, data source, true machine count (~100s vs 8 demo). |
| 2 | **Collect Sample Data** | 🟡 | **Receiving side ✅** — v1 contract, auto-registration, verify endpoint, API-key auth, all tested. **Remaining:** deploy publicly + company sends real packets. |
| 3 | Backend Setup | ✅ | Express + MongoDB (Atlas) + routes + middleware (devAuth, scopeFilter). |
| 4 | Ingestion API | ✅ | `POST /api/v1/ingest` (v1 envelope, 202, auto-register) + legacy `/api/ingest`. API-key auth. |
| 5 | Store Raw Data | ✅ | `RawPayload` collection — stores packets verbatim (audit/replay source). |
| 6 | Data Analysis | 🟡 | Tooling done (`/api/inspect/summary` lists fields per machine). Real analysis pending real samples. |
| 7 | Database Design | ✅ | Machine, MachineState (current), Telemetry (history), MachineType, Job, Employee, DowntimeEvent, RawPayload. |
| 8 | Indexing | ✅ | Indexes on machineId + timestamp (Telemetry `{machineId, ts}`, DowntimeEvent, RawPayload). |
| 9 | Dashboard APIs | ✅ | machines, machine detail, history, dashboard, jobs, employees, shifts, downtime, water, electricity, operator-map. |
| 10 | Aggregation Pipelines | 🟡 | Aggregations done in JS per-route; works at current scale. Refactor hot paths to Mongo `$group` pipelines for large data. |
| 11 | Frontend | ✅ | Dashboard + 10 pages (Machines, Jobs, Downtime, History, Water, Electricity, Operator Map, Employees, Shifts, AI Query). |
| 12 | Real-Time Updates | ✅ | Socket.IO `state:update` → live refetch on every page. |
| 13 | Charts | 🟡 | Bar charts for dept output/efficiency/water/electricity + hourly load. **Missing:** time-series line charts (temp/production/downtime trends). |
| 14 | Alerts | 🔴 | `FieldDef.thresholds` exists in schema; no evaluation engine or notifications yet. Current "alerts" = stopped-machine count only. |
| 15 | Authentication | 🟡 | Role model + scoping fully built; **ingest API-key auth done**. **Missing:** real user login (JWT/passwords) — currently a dev-role header switch. |
| 16 | Optimization | 🔴 | History has a basic limit cap. No pagination UI, projection, or caching yet. |
| 17 | Load Testing | 🔴 | Not started (1K / 100K / 1M records). |
| 18 | Deployment | 🟡 | DB on Atlas (cloud). App is production-buildable; not yet deployed from this repo. |

---

## Immediate next actions (to unblock Phase 2)

1. **Add API-key validation** to `/api/ingest` — reject unknown keys; allowed keys in `.env`.
2. **Deploy the ingest endpoint** to a public HTTPS host the company can reach.
3. **Write the integration spec** to hand the company (URL, header, body, identifier rule, example).
4. Company sends **real sample packets** → run `/api/inspect/summary` → **Phase 6** real analysis.
5. Register real **MachineTypes** + machines from the discovered shapes → real data flows end-to-end.

## Integration spec (for the company)
```
POST https://<your-host>/api/ingest
Header:  x-api-key: <issued key>
Body:    machine JSON, ANY shape, MUST include a machine id
         e.g. { "machineCode": "WASHER-01", "speed": 72, "temperature": 74, ... }
Resp:    { "ok": true, "id": "<rawId>" }
```

## Run commands
```
# backend           cd server && npm run dev
# simulator (demo)   cd server && npm run simulate      # 8 machines, full params
# seed people/jobs   cd server && npm run seed:data     # idempotent
# frontend           cd client && npm run dev           # http://localhost:5173
# inspect raw data   GET /api/inspect/summary           # discover real field shapes
```
