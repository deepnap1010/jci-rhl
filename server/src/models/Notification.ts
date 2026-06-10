// ============================================================
//  NOTIFICATION MODEL  —  per-recipient, persisted alerts
//
//  Created when a job is assigned to an operator / supervisor.
//  Addressed to a login (User) by id when we can link one via
//  email, and ALWAYS to the Employee + denormalized email so the
//  notification survives even if a login is created later.
//  Job context is denormalized so the bell can render without
//  joins and the notification stays accurate if the job changes.
// ============================================================
import { Schema, model } from 'mongoose';

const NotificationSchema = new Schema(
  {
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    recipientEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    email: { type: String, default: '', lowercase: true, trim: true, index: true },
    audience: { type: String, enum: ['operator', 'supervisor', 'prodManager', 'plantHead', 'superAdmin', 'admin'], required: true },
    // 'jobAssigned' | 'idleAlert' | 'idleEscalation'
    type: { type: String, default: 'jobAssigned' },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },

    // optional link to a source record + an inline action (e.g. acknowledge a downtime report)
    refType: { type: String, default: null }, // 'downtimeReport' | null
    refId: { type: Schema.Types.ObjectId, default: null },
    actionType: { type: String, default: null }, // 'acknowledge' | null
    machineCode: { type: String, default: '' },

    // ── denormalized job context ──
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    jobNumber: { type: String, default: '' },
    orderNumber: { type: String, default: '' },
    fabricName: { type: String, default: '' },
    stage: { type: String, default: '' },
    machineId: { type: String, default: null },
    targetProduction: { type: Number, default: 0 },
    shift: { type: String, default: 'A' },

    title: { type: String, default: '' },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const NotificationModel = model('Notification', NotificationSchema);
