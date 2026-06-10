// ============================================================
//  TASK  —  delegated work passed DOWN the org chart.
//  Production Head → Production Manager → Supervisor → Operator.
//  Each hand-off is assigned to one direct report and notifies
//  them. Sub-division is modelled via parentTaskId.
// ============================================================
import { Schema, model } from 'mongoose';

const TaskSchema = new Schema(
  {
    taskNumber: { type: String, unique: true, sparse: true }, // "TASK-3001"
    title: { type: String, required: true },
    details: { type: String, default: '' },
    targetProduction: { type: Number, default: 0 }, // meters
    department: { type: String, default: '' }, // line / stage this covers
    machineId: { type: String, default: null }, // set when a supervisor pins it to a machine

    // when a task IS a production job handed to someone, link back to it
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    jobNumber: { type: String, default: '' },

    assignedToId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedToName: { type: String, default: '' },
    assignedToRole: { type: String, default: '' },

    assignedById: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedByName: { type: String, default: '' },
    assignedByRole: { type: String, default: '' },

    parentTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null }, // sub-divided from

    status: { type: String, enum: ['assigned', 'inProgress', 'done'], default: 'assigned', index: true },
  },
  { timestamps: true }
);

export const TaskModel = model('Task', TaskSchema);
