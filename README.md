# SmartFactory — Foundation

Industrial production monitoring. **Vite + React (CSR)** frontend,
**Express + Socket.io** backend, **MongoDB** database, **TypeScript** everywhere.

---

## ⚡ Quick start (run the whole app)

You need **Node 18+** and **MongoDB** (see STEP 0 below for install help).

Open **three terminals** from the project root:

```bash
# Terminal 1 — backend
cd server
npm install
cp .env.example .env          # then put your MongoDB URI in .env
npm run seed                  # fills the DB with demo machines
npm run dev                   # → http://localhost:4000

# Terminal 2 — live data simulator (fake machines pushing data)
cd server
npm run simulate

# Terminal 3 — frontend
cd client
npm install
npm run dev                   # → http://localhost:5173
```

Open **http://localhost:5173**. Use the **role-switcher tabs** (top right)
to flip between Admin / Plant Head / Prod Manager / Supervisor / Operator and
watch the sidebar and the data scope change live.

> The frontend proxies `/api` and the socket to the backend automatically
> (see `client/vite.config.ts`), so you don't configure any URLs in dev.

### What works right now

- **Role-based shell** — sidebar nav + data scope change per role (all 5 roles).
- **Machines page** — live cards with status, metrics, and a **Details modal**
  that renders each machine type's dynamic IOT parameters.
- **Dashboard** — KPI cards, production pipeline, department output.
- **Downtime** — idle/stopped breakdown.
- **AI Query** — answers simple questions over the live data.
- **Live updates** — the simulator pushes data; the UI refreshes via Socket.io.
- **Ingestion + Inspector** — `/api/ingest` accepts real machine data;
  `server/inspector.html` shows what's arriving.

Utility/management pages (Water Flow, Electricity, Employees, etc.) are wired
into the shell with a ready placeholder — the data layer and scoping already
work, they just need their specific charts added.

---

This repo currently contains the **foundation only** — the part everything
else is built on. Get this running and verified before handing out parallel
work to the team.

---

## What's in here

```
smartfactory/
├── shared/types.ts          ← the common language (both sides import this)
├── server/                  ← Express + Socket.io + Mongo
│   └── src/
│       ├── config/          ← roleConfig (permissions) + db connection
│       ├── middleware/      ← auth (temp) + scopeFilter (security wall)
│       ├── models/          ← Machine, MachineType, MachineState
│       ├── routes/          ← machines, dashboard
│       ├── seed/            ← seed.ts (fills DB with demo data)
│       └── index.ts         ← server entry point
├── client/                  ← Vite React app (scaffold yourself, step 1)
└── docs/API_CONTRACT.md     ← the frontend↔backend agreement
```

---

## STEP 0 — Install the tools (one time)

You need **Node.js** (v18+) and **MongoDB**.

### Node.js

Download the LTS version from <https://nodejs.org>. Verify:

```bash
node -v   # should print v18.x or higher
npm -v
```

### MongoDB — pick ONE option

**Option A — MongoDB Atlas (cloud, easiest, recommended to start):**

1. Go to <https://www.mongodb.com/atlas> → create a free account.
2. Create a free **M0 cluster**.
3. Click **Connect** → **Drivers** → copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/smartfactory`
4. Under **Network Access**, add your IP (or `0.0.0.0/0` for dev only).
5. You'll paste this string into `.env` in Step 2.

**Option B — Local MongoDB (runs on your machine):**

- Windows: download MongoDB Community Server from
  <https://www.mongodb.com/try/download/community>, install, and it runs as
  a service. Your URI is `mongodb://localhost:27017/smartfactory`.
- Mac: `brew install mongodb-community` then `brew services start mongodb-community`.

> Tip for the team: start with **Atlas** so everyone shares one database and
> sees the same data. Switch to local later if needed — it's a one-line change.

---

## STEP 1 — Scaffold the frontend (one time)

From the repo root:

```bash
npm create vite@latest client -- --template react-ts
cd client
npm install
```

Then add the shared path alias to `client/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared') },
  },
});
```

And add the same alias to `client/tsconfig.json` under `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@shared/*": ["../shared/*"] }
```

---

## STEP 2 — Set up the backend

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and paste your MongoDB URI from Step 0:

```
MONGO_URI=<your-atlas-or-local-uri>
PORT=4000
```

---

## STEP 3 — Seed the database

This fills MongoDB with demo machine types, machines, and live states:

```bash
npm run seed
```

At the end it prints a list of machine IDs like:

```
COPY one of these _id values into auth.ts ...
  CBR-01           66a1f2...
  WASHER-01        66a1f3...
```

Copy one of those IDs — you'll need it for the verification test.

---

## STEP 4 — Run the server

```bash
npm run dev
```

You should see:

```
✅ MongoDB connected
🚀 Server running on http://localhost:4000
```

---

## STEP 5 — VERIFY THE FOUNDATION (do not skip)

This proves role-based scoping works. **If this passes, the foundation is
solid and you can hand out parallel work.**

### Test 1 — Admin sees everything

```bash
curl -H "x-dev-role: admin" http://localhost:4000/api/machines
```

Should return **all** machines (8 from the seed).

### Test 2 — Operator sees only their machines

1. Open `server/src/middleware/auth.ts`.
2. Find the `operator` entry in `DEV_USERS`.
3. Paste a machine `_id` (from Step 3) into `assignedMachineIds`:
   ```ts
   operator: {
     ...
     assignedMachineIds: ['66a1f2...'],  // ← the id you copied
   },
   ```
4. Save (server auto-restarts), then:
   ```bash
   curl -H "x-dev-role: operator" http://localhost:4000/api/machines
   ```

✅ **PASS:** you get back **exactly 1 machine** (the one you assigned).
❌ **FAIL:** you get all 8 → there's a bug in `scopeFilter.ts`. Fix it now.

### Test 3 — Prod Manager sees only their departments

```bash
curl -H "x-dev-role: prodManager" http://localhost:4000/api/machines
```

✅ Should return only machines in `CBR (Bleaching)` and `Washing`
(the demo departments set in `auth.ts`).

---

## STEP 6 — The ingestion endpoint (give this to the company)

This is the API the company's real machines POST their data into. It is
built to **accept anything, store it raw, and respond instantly** — so you
can see what the machines actually send before designing the final schema.

### Try it with the simulator (no hardware needed)

With the server running (`npm run dev`), in a second terminal:

```bash
npm run simulate
```

This mimics 3 real machines pushing different-shaped data every 3 seconds —
a washer (squeezers, chemical counters), a bleacher (pH, concentration), and
a dyeing machine that occasionally sends a junk `-563.3` value on purpose
(just like the real bad readings we saw).

### Watch what arrives — the Inspector

Open `server/inspector.html` in your browser. It shows:

- **Total packets received**
- **Which machine codes** are sending, and how often
- **Field discovery** — the exact field names each machine sends

That last one is the point: you **design the `MachineType` registry from what
you observe here**, instead of guessing. When you see `WASHER-01` sending
`COMPSQUEEZER7` that you don't have yet, you add one DB entry — no code change.

### Give the company this URL

```
POST  http://YOUR_SERVER:4000/api/ingest
Body: JSON, any shape, with a machine identifier
      (we look for: machineCode / code / machine / deviceId / id)
```

### The two-collection design (why it's safe)

- **RawPayload** = exactly what arrived, append-only, never edited. Audit log
  + replay source. If you map a field wrong later, re-run over raw history.
- **MachineState** = the clean, validated current view the dashboard reads.

The dashboard never reads raw; raw never touches the dashboard. They're joined
only by the mapper (Stage 3), which you build *after* seeing real data.

---

## STEP 7 — What's next (after data is flowing)

1. **Stage 3 mapper** — reads raw packets, maps them to clean `MachineState`
   using the `MachineType` registry, computes status/efficiency, flags suspect
   values (the `-563.3`), emits `state:update` over Socket.io.
2. **Frontend shell** — sidebar from `roleConfig` + role-switcher tabs.
3. **Machines page** — dynamic `MachineCard` + Details/History/Configure modals.

---

## What's next (after verification passes)

Now parallel work is safe. Suggested order:

1. **Machine simulator** — a script that pushes fake live data every few
   seconds, so the frontend sees real-time updates without PLC hardware.
2. **Frontend shell** — sidebar that renders nav from `roleConfig`, plus the
   role-switcher tabs (Admin / Plant Head / ...).
3. **Machines page** — the dynamic `MachineCard` + Details / History /
   Configure modals.
4. The remaining pages (Dashboard, Downtime, Water Flow, etc.).

---

## Rules for the team (keep the project smooth)

- **New data field?** Add it to `shared/types.ts` FIRST, then use it.
- **Never re-filter for permissions on the frontend.** The backend already
  scoped the data. Trust it.
- **Components are `.tsx`, everything else is `.ts`.** No `.jsx` anywhere.
- **Never commit `.env` or `node_modules`** (already gitignored).
- **Foundation files** (shared/types, roleConfig, scopeFilter) are changed
  only with team agreement — they affect everyone.
