// ============================================================
//  EMPLOYEE MODEL  —  people on the floor
//  Operators, supervisors, prod managers. Drives Employees &
//  Roles, Shift Management, Operator Map, and the operator /
//  supervisor names shown on machines and jobs.
// ============================================================
import { Schema, model } from 'mongoose';
import { DEPARTMENTS } from '@shared/types';

const EmployeeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // "OPR-01", "SUP-02"
    name: { type: String, required: true },
    email: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    team: { type: String, default: '' },
    roleSlug: { type: String, default: '' }, // links to a Role (RBAC), e.g. "production-operator"
    role: {
      type: String,
      enum: ['admin', 'plantHead', 'prodManager', 'supervisor', 'operator'],
      required: true,
    },
    department: { type: String, enum: DEPARTMENTS, required: true },
    shift: { type: String, enum: ['A', 'B', 'C'], default: 'A' },
    assignedMachineIds: { type: [String], default: [] }, // machine string codes
    supervisorId: { type: Schema.Types.ObjectId, ref: 'Employee' },
  },
  { timestamps: true }
);

export const EmployeeModel = model('Employee', EmployeeSchema);
