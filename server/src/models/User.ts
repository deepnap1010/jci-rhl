// ============================================================
//  USER MODEL  —  a login account (credentials + role)
//
//  This is what the auth system reads. It is DISTINCT from the
//  Employee model: an Employee is a person on the floor; a User
//  is something that can log in to the dashboard.
//
//  The Super Admin creates Users, assigns a role, and sets a
//  temporary password. `mustChangePassword` stays true until the
//  user resets that temp password on first login.
//
//  Passwords are never stored in plain text — only a bcrypt hash.
// ============================================================
import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { DEPARTMENTS } from '@shared/types';

const ROLES = ['superAdmin', 'admin', 'plantHead', 'prodManager', 'supervisor', 'operator', 'employee'] as const;

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },

    // scoping (mirrors the shared User type used by scopeFilter)
    assignedMachineIds: { type: [String], default: [] }, // machine codes/ids
    assignedLines: { type: [String], enum: DEPARTMENTS, default: [] }, // for prodManager

    mustChangePassword: { type: Boolean, default: true }, // force reset of the temp password
    isActive: { type: Boolean, default: true }, // a disabled account cannot log in
    // "temporary delete": while this date is in the future the account is
    // suspended (cannot log in) and is auto-restored once it passes.
    suspendedUntil: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // who created this login
    // org chart: who this user reports to (operator→supervisor→plantHead→superAdmin)
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// ---- password helpers (kept on the model so hashing lives in one place) ----
UserSchema.methods.setPassword = async function setPassword(plain: string) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

UserSchema.methods.verifyPassword = function verifyPassword(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash);
};

export const UserModel = model('User', UserSchema);

// Convenience: hash a password without an instance (used by the bootstrapper).
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
