// ============================================================
//  ADDITIVE SEED  —  employees + jobs (dashboard-only data)
//
//  Links to whatever machines ALREADY exist (by machineId). It
//  NEVER creates machines or telemetry. Safe + idempotent.
//  Optional: run only if you want demo people/jobs in the DB.
//    npm run seed:data
// ============================================================
import 'dotenv/config';
import { connectDB } from '../config/db';
import { MachineModel } from '../models/Machine';
import { EmployeeModel } from '../models/Employee';
import { JobModel } from '../models/Job';
import type { Role, ShiftCode, Department } from '@shared/types';

async function run() {
  await connectDB();

  const machines = await MachineModel.find().lean();
  const existing = new Set(machines.map((m) => (m as { machineId: string }).machineId));
  const keep = (codes: string[]) => codes.filter((c) => existing.has(c));
  console.log(`Found ${machines.length} machines:`, [...existing].join(', ') || '(none)');

  // ---- supervisors ----
  const supervisors: { code: string; name: string; department: Department; shift: ShiftCode; machines: string[] }[] = [
    { code: 'SUP-01', name: 'Krishna', department: 'CBR (Bleaching)', shift: 'A', machines: ['CBR-01', 'CBR-02', 'colddyeing-01', 'colddyeing-02'] },
    { code: 'SUP-02', name: 'Krisdhna', department: 'Washing', shift: 'A', machines: ['WASHER-01', 'WASH-RANGE-01', 'MAXI-01', 'MERCERIZER-01'] },
  ];
  const supIdByCode = new Map<string, unknown>();
  for (const s of supervisors) {
    const doc = await EmployeeModel.findOneAndUpdate(
      { code: s.code },
      { code: s.code, name: s.name, role: 'supervisor' as Role, department: s.department, shift: s.shift, assignedMachineIds: keep(s.machines) },
      { upsert: true, new: true }
    );
    supIdByCode.set(s.code, doc!._id);
  }

  await EmployeeModel.findOneAndUpdate(
    { code: 'PM-01' },
    { code: 'PM-01', name: 'Rohit', role: 'prodManager' as Role, department: 'CBR (Bleaching)' as Department, shift: 'A', assignedMachineIds: [] },
    { upsert: true }
  );

  // ---- operators ----
  const operators: { code: string; name: string; department: Department; shift: ShiftCode; machines: string[]; sup: string }[] = [
    { code: 'OPR-01', name: 'Rohan', department: 'CBR (Bleaching)', shift: 'A', machines: ['CBR-01', 'CBR-02'], sup: 'SUP-01' },
    { code: 'OPR-02', name: 'Subham', department: 'Washing', shift: 'B', machines: ['WASHER-01', 'WASH-RANGE-01'], sup: 'SUP-02' },
    { code: 'OPR-03', name: 'Anil', department: 'Hot Dyeing', shift: 'A', machines: ['MAXI-01'], sup: 'SUP-02' },
    { code: 'OPR-04', name: 'Vikram', department: 'Cold Dyeing', shift: 'C', machines: ['colddyeing-01', 'colddyeing-02'], sup: 'SUP-01' },
    { code: 'OPR-05', name: 'Suresh', department: 'Mercerizing', shift: 'A', machines: ['MERCERIZER-01'], sup: 'SUP-02' },
  ];
  const empIdByCode = new Map<string, unknown>(supIdByCode);
  for (const o of operators) {
    const doc = await EmployeeModel.findOneAndUpdate(
      { code: o.code },
      { code: o.code, name: o.name, role: 'operator' as Role, department: o.department, shift: o.shift, assignedMachineIds: keep(o.machines), supervisorId: supIdByCode.get(o.sup) },
      { upsert: true, new: true }
    );
    empIdByCode.set(o.code, doc!._id);
  }

  // ---- jobs (link to existing machines only) ----
  const jobs: { jobNumber: string; orderNumber: string; fabricName: string; stage: Department; target: number; machine?: string; op?: string; sup?: string; status: string }[] = [
    { jobNumber: 'JOB-10592', orderNumber: 'LOT1-05', fabricName: 'Cotrize', stage: 'CBR (Bleaching)', target: 15000, machine: 'CBR-01', op: 'OPR-01', sup: 'SUP-01', status: 'inProgress' },
    { jobNumber: 'JOB-10593', orderNumber: 'LOT1-06', fabricName: 'Poplin', stage: 'CBR (Bleaching)', target: 16000, machine: 'CBR-02', op: 'OPR-01', sup: 'SUP-01', status: 'inProgress' },
    { jobNumber: 'JOB-10594', orderNumber: 'LOT2-01', fabricName: 'Twill', stage: 'Washing', target: 20000, machine: 'WASHER-01', op: 'OPR-02', sup: 'SUP-02', status: 'inProgress' },
    { jobNumber: 'JOB-10595', orderNumber: 'LOT2-02', fabricName: 'Canvas', stage: 'Washing', target: 22000, machine: 'WASH-RANGE-01', op: 'OPR-02', sup: 'SUP-02', status: 'inProgress' },
    { jobNumber: 'JOB-10596', orderNumber: 'LOT3-01', fabricName: 'Satin', stage: 'Hot Dyeing', target: 9000, machine: 'MAXI-01', op: 'OPR-03', sup: 'SUP-02', status: 'inProgress' },
    { jobNumber: 'JOB-10597', orderNumber: 'LOT4-01', fabricName: 'Voile', stage: 'Mercerizing', target: 9000, machine: 'MERCERIZER-01', op: 'OPR-05', sup: 'SUP-02', status: 'inProgress' },
    { jobNumber: 'JOB-10598', orderNumber: 'LOT5-01', fabricName: 'Lawn', stage: 'Cold Dyeing', target: 6000, machine: 'colddyeing-01', op: 'OPR-04', sup: 'SUP-01', status: 'inProgress' },
    { jobNumber: 'JOB-10600', orderNumber: 'LOT6-01', fabricName: 'Denim', stage: 'Rebatching', target: 12000, status: 'pending' },
  ];
  for (const j of jobs) {
    const machineId = j.machine && existing.has(j.machine) ? j.machine : undefined;
    await JobModel.findOneAndUpdate(
      { jobNumber: j.jobNumber },
      {
        jobNumber: j.jobNumber, orderNumber: j.orderNumber, fabricName: j.fabricName, stage: j.stage,
        targetProduction: j.target, status: machineId ? j.status : 'pending',
        machineId, operatorId: j.op ? empIdByCode.get(j.op) : undefined, supervisorId: j.sup ? empIdByCode.get(j.sup) : undefined,
      },
      { upsert: true }
    );
  }

  console.log(`✅ Seeded. Employees: ${await EmployeeModel.countDocuments()}, Jobs: ${await JobModel.countDocuments()}`);
  process.exit(0);
}

run().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); });
