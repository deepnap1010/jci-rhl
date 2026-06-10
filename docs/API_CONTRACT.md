# API Contract — SmartFactory

This is the agreement between frontend and backend. Backend implements
these endpoints; frontend can mock them to build UI in parallel.

> **GOLDEN RULE:** Every list endpoint returns data that is **already
> scoped to the user's role**. The frontend does **NOT** re-filter for
> permissions. An operator calling `/api/machines` simply receives only
> their machines — the backend enforces it.

## Authentication (temporary dev mode)

Until real JWT auth lands, the backend reads a header to fake the user:

```
x-dev-role: admin | plantHead | prodManager | supervisor | operator
```

Example:

```
curl -H "x-dev-role: operator" http://localhost:4000/api/machines
```

## Endpoints

| Method | Path                  | Returns          | Scoped? | Notes                          |
| ------ | --------------------- | ---------------- | ------- | ------------------------------ |
| GET    | `/`                   | text             | no      | health check                   |
| GET    | `/api/machines`       | `Machine[]`      | yes     | list of machines               |
| GET    | `/api/machines/:id`   | `{machine,state}`| yes     | one machine + live state       |
| GET    | `/api/dashboard`      | `DashboardData`  | yes     | KPI summary numbers            |

### Coming next (not built yet)

| Method | Path                  | Returns          | Notes                          |
| ------ | --------------------- | ---------------- | ------------------------------ |
| POST   | `/api/ingest`         | `200 OK`         | machines/simulator push data   |
| GET    | `/api/machine-state`  | `MachineState[]` | all live snapshots             |
| GET    | `/api/history`        | `TelemetryRow[]` | paginated history              |
| GET    | `/api/downtime`       | downtime cards   | idle/stopped breakdown         |
| GET    | `/api/jobs`           | `Job[]`          | job tracking                   |
| POST   | `/api/machines/:id/configure` | `200 OK` | Configure modal (admin only)   |

## Socket.io events

| Event           | Direction       | Payload        | When                        |
| --------------- | --------------- | -------------- | --------------------------- |
| `state:update`  | server → client | `MachineState` | a machine pushes new data   |

## Type shapes

All response shapes are defined in `shared/types.ts`. Import them — never
redefine them. Key ones: `Machine`, `MachineState`, `DashboardData`,
`Job`, `User`, `Department`.
