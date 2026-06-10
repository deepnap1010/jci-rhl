// server/src/seed/simulator.ts
// ============================================================
//  MACHINE SIMULATOR  (full real-parameter version)
//  Mimics real machines pushing data to /api/ingest on a timer.
//  Each machine sends its FULL parameter set — matching the
//  machine types created by the seed — so the Details view
//  looks exactly like the real hardware (24+ params on the washer).
//
//  Run (server must be running first):  npm run simulate
// ============================================================
const API = process.env.SIM_API || 'http://localhost:4000/api/v1/ingest';
const EVERY_MS = Number(process.env.SIM_INTERVAL || 3000);

const rnd = (min: number, max: number) => +(min + Math.random() * (max - min)).toFixed(1);
const rint = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

type Sender = () => Record<string, unknown>;

// running counters so totals climb over time like real machines
const totals: Record<string, number> = {};
function climb(key: string, step: number) {
  totals[key] = (totals[key] ?? rint(50, 100)) + rnd(0, step);
  return +totals[key].toFixed(1);
}

const machines: Record<string, Sender> = {
  // ---- SOPAR Washer: full IOT parameter set ----
  'WASHER-01': () => ({
    machineCode: 'WASHER-01',
    speed: rint(60, 80),
    temperature: rint(68, 78),
    production: rint(0, 16000),
    waterFlow: rint(2500, 3200),
    AUTOMODE: true,
    BLEACHINGMODE: Math.random() > 0.4,
    CHEM1RATEMLKG: rint(30, 45),
    CHEM1TOTALLTR: climb('w_c1', 1.5),
    CHEM2TOTALLTR: climb('w_c2', 1.5),
    CHEM3RATEMLKG: rint(0, 10),
    // ~10% of the time send the real-world junk negative value
    CHEM3TOTALLTR: Math.random() < 0.1 ? -563.3 : climb('w_c3', 1.2),
    CHEM4TOTALLTR: rnd(0, 1),
    CHEM5RATEMLKG: 0,
    COMPBATCHER: rnd(0, 1),
    COMPCONV: rnd(4, 6),
    COMPDRYER1: rnd(380, 410),
    COMPDRYER2: rnd(0, 1),
    COMPECOMAXSLAVE: rnd(3, 5),
    COMPENTRYSCARY: rnd(0, 1),
    COMPSQUEEZER1: rint(0, 4),
    COMPSQUEEZER2: rnd(2, 4),
    COMPSQUEEZER3: rint(5, 9),
    COMPSQUEEZER4: rint(0, 2),
    COMPSQUEEZER5: rnd(390, 400),
    COMPSQUEEZER6: rint(5, 8),
    COMPSTEAMER1: rnd(3, 4),
    COMPSTEAMER3: rnd(5, 6),
    DOWNTIMESECONDS: rint(80, 120),
  }),

  // ---- Continuous Washing Range: same type, running hard ----
  'WASH-RANGE-01': () => ({
    machineCode: 'WASH-RANGE-01',
    speed: rint(70, 95),
    temperature: rint(70, 85),
    production: rint(8000, 20000),
    waterFlow: rint(2800, 3500),
    AUTOMODE: true,
    BLEACHINGMODE: false,
    CHEM1RATEMLKG: rint(35, 50),
    CHEM1TOTALLTR: climb('wr_c1', 2),
    CHEM2TOTALLTR: climb('wr_c2', 2),
    COMPSQUEEZER1: rint(2, 6),
    COMPSQUEEZER2: rnd(3, 5),
    COMPDRYER1: rnd(400, 420),
    COMPSTEAMER1: rnd(4, 6),
    DOWNTIMESECONDS: rint(0, 40),
  }),

  // ---- CBR Bleaching machines ----
  'CBR-01': () => ({
    machineCode: 'CBR-01',
    speed: Math.random() > 0.6 ? rint(35, 45) : 0,
    temperature: rint(78, 92),
    production: rint(0, 14000),
    waterFlow: rint(2000, 3000),
    concentration: rnd(1, 5),
    phLevel: rnd(7, 9),
    steamPressure: rnd(2, 6),
    caustic: climb('c1_caustic', 1),
    peroxide: climb('c1_perox', 0.8),
  }),
  'CBR-02': () => ({
    machineCode: 'CBR-02',
    speed: Math.random() > 0.5 ? rint(38, 48) : 0,
    temperature: rint(82, 95),
    production: rint(0, 16000),
    waterFlow: rint(2200, 2800),
    concentration: rnd(1.5, 4.5),
    phLevel: rnd(7.5, 9.5),
    steamPressure: rnd(2, 5),
    caustic: climb('c2_caustic', 1),
    peroxide: climb('c2_perox', 0.9),
  }),

  // ---- Dyeing machines ----
  'MAXI-01': () => ({
    machineCode: 'MAXI-01',
    speed: Math.random() > 0.5 ? rint(25, 35) : 0,
    temperature: rint(60, 80),
    production: rint(0, 8000),
    waterFlow: rint(1000, 2000),
    bathTemp: rint(82, 98),
    turns: rint(0, 24),
    liquorRatio: rnd(6, 10),
    programNumber: rint(1, 12),
    dyeDosed: climb('maxi_dye', 0.5),
  }),
  'MERCERIZER-01': () => ({
    machineCode: 'MERCERIZER-01',
    speed: rint(40, 55),
    temperature: rint(88, 98),
    production: rint(3000, 9000),
    waterFlow: rint(3500, 4500),
    bathTemp: rint(85, 99),
    turns: rint(5, 20),
    liquorRatio: rnd(5, 8),
    programNumber: rint(1, 6),
    dyeDosed: climb('merc_dye', 0.6),
  }),
  'colddyeing-01': () => ({
    machineCode: 'colddyeing-01',
    speed: rint(20, 35),
    temperature: rint(25, 40),
    production: rint(1000, 6000),
    waterFlow: rint(800, 1800),
    bathTemp: rint(20, 35),
    turns: rint(0, 15),
    liquorRatio: rnd(7, 11),
    programNumber: rint(1, 8),
    dyeDosed: climb('cd1_dye', 0.4),
  }),
  'colddyeing-02': () => ({
    machineCode: 'colddyeing-02',
    speed: rint(20, 35),
    temperature: rint(25, 40),
    production: rint(1000, 6000),
    waterFlow: rint(800, 1800),
    bathTemp: rint(20, 35),
    turns: rint(0, 15),
    liquorRatio: rnd(7, 11),
    programNumber: rint(1, 8),
    dyeDosed: climb('cd2_dye', 0.4),
  }),
};

// machine type + friendly name per code (so the dashboard derives
// the right department, exactly like real PLC payloads carry `dept`)
const TYPE_OF: Record<string, string> = {
  'WASHER-01': 'washer', 'WASH-RANGE-01': 'washer',
  'CBR-01': 'cbr', 'CBR-02': 'cbr',
  'MAXI-01': 'maxi', 'MERCERIZER-01': 'mercerizer',
  'colddyeing-01': 'cold_dyeing', 'colddyeing-02': 'cold_dyeing',
};
const NAME_OF: Record<string, string> = {
  'WASHER-01': 'SOPAR Washer', 'WASH-RANGE-01': 'Continuous Washing Range',
  'CBR-01': 'CBR Bleaching Machine', 'CBR-02': 'CBR Bleaching Machine',
  'MAXI-01': 'Dyeing / Batch Machine', 'MERCERIZER-01': 'Mercerizer',
  'colddyeing-01': 'Cold Dyeing Machine', 'colddyeing-02': 'Cold Dyeing Machine',
};

async function tick() {
  for (const [code, build] of Object.entries(machines)) {
    const built = build();
    // wrap the flat readings into the v1 envelope the real company uses:
    //   { machineId, machineName, machineType, timestamp, data: { ...readings } }
    const { machineCode, ...data } = built;
    const id = (machineCode as string) ?? code;
    const payload = {
      machineId: id,
      machineName: NAME_OF[id] ?? id,
      machineType: TYPE_OF[id] ?? 'unknown',
      timestamp: new Date().toISOString(),
      data,
    };
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': `key-${code}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      console.log(`→ ${code.padEnd(16)} sent  (ok=${json.success ?? json.ok})`);
    } catch {
      console.error(`✗ ${code} failed — is the server running at ${API}?`);
    }
  }
  console.log('');
}

console.log(`📡 Simulator started. Pushing FULL parameter sets to ${API} every ${EVERY_MS}ms.`);
console.log('   8 machines, each with its real parameter shape.');
console.log('   Open the app → Machines → Details to see all params live.\n');
tick();
setInterval(tick, EVERY_MS);

export {};