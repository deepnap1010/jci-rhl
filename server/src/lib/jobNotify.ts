// ============================================================
//  JOB NOTIFY  —  tell the assigned operator / supervisor
//
//  Operator/Supervisor on a job are login Users now, so we notify
//  them directly (in-app + best-effort email). No more Employee↔
//  User email matching — the assignee IS a login account.
// ============================================================
import type { Server } from 'socket.io';
import { NotificationModel } from '../models/Notification';
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
  const targets: { audience: 'operator' | 'supervisor'; userId: unknown }[] = [];
  if (opts.notifyOperator && job.operatorId) targets.push({ audience: 'operator', userId: job.operatorId });
  if (opts.notifySupervisor && job.supervisorId) targets.push({ audience: 'supervisor', userId: job.supervisorId });
  if (!targets.length) return;

  for (const t of targets) {
    try {
      const user = await UserModel.findById(t.userId as string).lean();
      if (!user) continue;
      const email = (user.email || '').toLowerCase().trim();

      const target = job.targetProduction || 0;
      const onMachine = job.machineId ? ` on ${job.machineId}` : '';
      const title = t.audience === 'operator' ? 'New job assigned to you' : 'You are supervising a new job';
      const body =
        `${job.jobNumber || 'Job'} · ${job.fabricName || '—'} · ${job.stage || '—'}${onMachine}` +
        (target ? ` · target ${target.toLocaleString()} mtr` : '') +
        (job.shift ? ` · shift ${job.shift}` : '');

      await NotificationModel.create({
        recipientUserId: user._id,
        email,
        audience: t.audience,
        type: 'jobAssigned',
        jobId: (job._id as string) ?? null,
        jobNumber: job.jobNumber || '',
        orderNumber: job.orderNumber || '',
        fabricName: job.fabricName || '',
        stage: job.stage || '',
        machineId: job.machineId ?? null,
        machineCode: (job.machineId as string) || '',
        targetProduction: target,
        shift: job.shift || 'A',
        title,
        body,
      });
      if (io) io.emit('notify:new', { userId: String(user._id), email });

      if (email) {
        sendJobAssignmentEmail({
          to: email,
          name: user.name || 'there',
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
