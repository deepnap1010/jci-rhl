// ============================================================
//  JOB NOTIFY  —  fan a job assignment out to its people
//
//  When a job is assigned to an operator / supervisor we create a
//  Notification for each recipient login, push a socket nudge so
//  connected bells refresh instantly, and send a best-effort
//  email (logged to console if SMTP is off).
//
//  Recipient resolution (a login = a User; the assignee = an
//  Employee — they are separate records). We deliver via BOTH:
//    1. Email link  — User.email === Employee.email (same person).
//    2. Machine scope — Users with the matching role whose
//       assignedMachineIds include the job's machine.
//  If neither resolves a login, we still store the notification
//  addressed to the Employee's email, so a login created later
//  with that email receives it.
// ============================================================
import type { Server } from 'socket.io';
import { NotificationModel } from '../models/Notification';
import { EmployeeModel } from '../models/Employee';
import { UserModel } from '../models/User';
import { sendJobAssignmentEmail } from './mailer';

export interface JobLikeForNotify {
  _id?: unknown;
  jobNumber?: string;
  orderNumber?: string;
  fabricName?: string;
  stage?: string;
  machineId?: string | null;
  targetProduction?: number;
  shift?: string;
  operatorId?: unknown;
  supervisorId?: unknown;
}

export async function notifyJobAssignees(
  io: Server | null,
  job: JobLikeForNotify,
  opts: { notifyOperator: boolean; notifySupervisor: boolean }
): Promise<void> {
  const targets: { audience: 'operator' | 'supervisor'; employeeId: unknown }[] = [];
  if (opts.notifyOperator && job.operatorId) targets.push({ audience: 'operator', employeeId: job.operatorId });
  if (opts.notifySupervisor && job.supervisorId) targets.push({ audience: 'supervisor', employeeId: job.supervisorId });
  if (!targets.length) return;

  for (const t of targets) {
    try {
      const emp = await EmployeeModel.findById(t.employeeId as string).lean();
      if (!emp) continue;
      const empEmail = (emp.email || '').toLowerCase().trim();

      // resolve recipient logins via email-link ∪ machine-scope (deduped by id)
      const recipients = new Map<string, { id: unknown; email: string; name: string }>();
      if (empEmail) {
        const u = await UserModel.findOne({ email: empEmail }).lean();
        if (u) recipients.set(String(u._id), { id: u._id, email: (u.email || '').toLowerCase(), name: u.name });
      }
      if (job.machineId) {
        const scoped = await UserModel.find({ role: t.audience, assignedMachineIds: job.machineId }).lean();
        for (const u of scoped) recipients.set(String(u._id), { id: u._id, email: (u.email || '').toLowerCase(), name: u.name });
      }

      const target = job.targetProduction || 0;
      const onMachine = job.machineId ? ` on ${job.machineId}` : '';
      const title = t.audience === 'operator' ? 'New job assigned to you' : 'You are supervising a new job';
      const body =
        `${job.jobNumber || 'Job'} · ${job.fabricName || '—'} · ${job.stage || '—'}${onMachine}` +
        (target ? ` · target ${target.toLocaleString()} mtr` : '') +
        (job.shift ? ` · shift ${job.shift}` : '');

      const base = {
        audience: t.audience,
        type: 'jobAssigned',
        recipientEmployeeId: emp._id,
        jobId: (job._id as string) ?? null,
        jobNumber: job.jobNumber || '',
        orderNumber: job.orderNumber || '',
        fabricName: job.fabricName || '',
        stage: job.stage || '',
        machineId: job.machineId ?? null,
        targetProduction: target,
        shift: job.shift || 'A',
        title,
        body,
      };

      const emailsToSend = new Set<string>();
      if (recipients.size) {
        for (const r of recipients.values()) {
          await NotificationModel.create({ ...base, recipientUserId: r.id, email: r.email });
          if (io) io.emit('notify:new', { userId: String(r.id), email: r.email });
          if (r.email) emailsToSend.add(r.email);
        }
      } else {
        // no login matched yet — address it to the employee's email so a
        // future login with that email still receives it in-app
        await NotificationModel.create({ ...base, recipientUserId: null, email: empEmail });
        if (io) io.emit('notify:new', { userId: null, email: empEmail });
      }

      // email the floor person's real inbox too (and any distinct login emails)
      if (empEmail) emailsToSend.add(empEmail);
      for (const to of emailsToSend) {
        sendJobAssignmentEmail({
          to,
          name: emp.name || 'there',
          audience: t.audience,
          jobNumber: job.jobNumber || '',
          orderNumber: job.orderNumber || '',
          fabricName: job.fabricName || '',
          stage: job.stage || '',
          machineId: job.machineId ?? null,
          targetProduction: target,
          shift: job.shift || 'A',
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('⚠️  job notification failed:', (e as Error).message);
    }
  }
}
