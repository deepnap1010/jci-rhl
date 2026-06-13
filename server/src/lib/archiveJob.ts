// ============================================================
//  ARCHIVE JOB  —  snapshot a job into JobHistory before deleting.
// ============================================================
import { JobHistoryModel } from '../models/JobHistory';
import { UserModel } from '../models/User';

interface Actor { _id?: string; name?: string; email?: string }

export async function archiveJob(doc: Record<string, unknown>, opts: { reason?: string; by?: Actor }): Promise<void> {
  // resolve operator / supervisor names (the live names at deletion time)
  const ids = [doc.operatorId, doc.supervisorId].filter(Boolean).map(String);
  const people = ids.length ? await UserModel.find({ _id: { $in: ids } }).select('name').lean() : [];
  const nameById = new Map(people.map((p) => [String((p as { _id: unknown })._id), (p as { name?: string }).name || '']));

  await JobHistoryModel.create({
    jobId: String(doc._id),
    jobNumber: doc.jobNumber || '',
    orderNumber: doc.orderNumber || '',
    fabricName: doc.fabricName || '',
    stage: doc.stage || '',
    status: doc.status || '',
    targetProduction: (doc.targetProduction as number) || 0,
    achievedProduction: (doc.achievedProduction as number) || 0,
    machineId: (doc.machineId as string) || '',
    operatorId: doc.operatorId ? String(doc.operatorId) : '',
    operatorName: doc.operatorId ? nameById.get(String(doc.operatorId)) || '' : '',
    supervisorId: doc.supervisorId ? String(doc.supervisorId) : '',
    supervisorName: doc.supervisorId ? nameById.get(String(doc.supervisorId)) || '' : '',
    batchId: (doc.batchId as string) || '',
    processType: (doc.processType as string) || '',
    glm: (doc.glm as number) || 0,
    liquorRatio: (doc.liquorRatio as string) || '',
    dyeStage: (doc.dyeStage as string) || '',
    shift: (doc.shift as string) || '',
    jobCreatedAt: (doc.createdAt as Date) || null,
    reason: opts.reason || '',
    deletedById: opts.by?._id || '',
    deletedByName: opts.by?.name || '',
    deletedByEmail: opts.by?.email || '',
    deletedAt: new Date(),
  });
}
