// ============================================================
//  JWT TOKENS  —  sign / verify the login token
//
//  On login we issue a signed JWT carrying the user's id + role.
//  Every protected request sends it back as:
//      Authorization: Bearer <token>
//  The auth middleware verifies it and loads the live user.
// ============================================================
import jwt from 'jsonwebtoken';
import type { Role } from '@shared/types';

const SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

export interface TokenPayload {
  sub: string; // user _id
  role: Role;
}

export function signToken(payload: TokenPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as any);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}
