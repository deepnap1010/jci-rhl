# Smart Factory — Data Ingestion (v1 contract)

> This mirrors the official **JCI_PLC_Integration_Guide** handed to data providers.
> Keep this and the PDF in sync.

The data provider sends standard HTTPS `POST` requests with JSON. They never touch
our database directly. They choose the `machineId` and the field names — new machines
and new fields are recorded automatically the first time they're seen.

## Endpoint
```
POST   https://<HOST>/api/v1/ingest          # production: https://jci-api.onrender.com
Header Content-Type: application/json
Header x-api-key: <key issued per provider>   # set INGEST_API_KEYS in .env to enforce
```
Legacy `POST /api/ingest` (flat payload) is still accepted for backward compatibility.

## Request envelope (structure fixed; `data` is free-form)
```json
{
  "machineId":   "MAXI-01",               // REQUIRED — unique, constant per machine
  "machineName": "Maxi Dyeing Machine",   // optional — stored on first sight
  "machineType": "maxi",                   // optional — used to auto-assign a department
  "timestamp":   "2026-06-05T10:30:00Z",   // optional — PLC time (ISO 8601 UTC); else server time
  "data": {                                // REQUIRED — readings, any flat fields
    "speed": 45, "bathTemp": 86.5, "turns": 12, "status": "running"
  }
}
```
Rules: keep `data` flat · numbers as numbers · consistent field names per machine.

## Responses
| Code | Meaning |
|------|---------|
| `202` | Accepted — `{ "success": true, "id": "…" }` |
| `400` | Missing `machineId` |
| `401` | Missing/!wrong `x-api-key` (only when keys are configured) |
| `500` | Our side — retry after a short delay |

## Verify it's live
```
GET https://<HOST>/api/v1/machines/MAXI-01/latest    # returns the latest stored reading
```

## How we process it (our side)
1. Stored **raw, untouched** in `RawPayload` (audit/replay source).
2. Mapper reads `data`, maps `speed/temperature/production/waterFlow`, puts the rest in `data`.
3. Unknown `machineId` → **auto-registered** (machine + type created; department guessed from `machineType`, reassignable by an admin).
4. Live snapshot (`MachineState`), history (`Telemetry`), and downtime events updated; dashboards refresh via Socket.IO.

Discover real field shapes once data flows: `GET /api/inspect/summary`.
