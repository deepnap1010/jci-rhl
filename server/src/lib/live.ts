// ============================================================
//  LIVE  —  real-time fan-out (Socket.IO) built for scale
//  • Optional Redis adapter so emits/rooms work across MULTIPLE Node
//    instances (set REDIS_URL). Without it: single-process in-memory.
//  • Authenticated sockets join SCOPE ROOMS, so a 'state:update' or a
//    'notify:new' reaches only the clients who care — not everyone.
//  • Coalesces state nudges: a burst of telemetry → one scoped emit.
// ============================================================
import type { Server } from 'socket.io';
import { verifyToken } from './token';
import { UserModel } from '../models/User';

export const ROOM = {
  fleet: 'fleet',
  dept: (d: string) => `dept:${d}`,
  machine: (id: string) => `machine:${id}`,
  user: (id: string) => `user:${id}`,
};

type ScopeUser = { _id: unknown; role?: string; assignedMachineIds?: string[]; assignedLines?: string[] };

// Which rooms a socket joins, from the authenticated user's data scope:
//   sees-all (superAdmin/admin/plantHead) → 'fleet'
//   prodManager                           → one room per assigned department line
//   supervisor/operator/employee          → one room per assigned machine
// Plus a personal room so notifications can target just this user.
function roomsForUser(u: ScopeUser): string[] {
  const rooms = [ROOM.user(String(u._id))];
  const role = u.role || '';
  if (role === 'superAdmin' || role === 'admin' || role === 'plantHead') rooms.push(ROOM.fleet);
  else if (role === 'prodManager') for (const d of u.assignedLines || []) rooms.push(ROOM.dept(d));
  else for (const m of u.assignedMachineIds || []) rooms.push(ROOM.machine(m));
  return rooms;
}

// ── coalesced, room-scoped state nudges ──────────────────────
// Many machine changes within COALESCE_MS collapse into ONE emit to the UNION of
// affected rooms. io.to([...rooms]) delivers at most once per socket, even when a
// socket is in several of the listed rooms.
const COALESCE_MS = Number(process.env.LIVE_COALESCE_MS) || 700;
let pending: Set<string> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function nudge(io: Server | null, machineId?: string, department?: string): void {
  if (!io) return;
  if (!pending) pending = new Set();
  pending.add(ROOM.fleet); // sees-all users hear about any change
  if (machineId) pending.add(ROOM.machine(machineId));
  if (department) pending.add(ROOM.dept(department));
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const rooms = pending;
    pending = null;
    if (rooms && rooms.size) io.to([...rooms]).emit('state:update', {});
  }, COALESCE_MS);
}

// Targeted notification refresh — only the recipient's own sockets refetch.
export function notifyUserLive(io: Server | null, userId?: string | null): void {
  if (io && userId) io.to(ROOM.user(String(userId))).emit('notify:new', {});
}

// Authenticate each socket from its handshake token and join its scope rooms.
// Unauthenticated/expired sockets still connect, but join no scope rooms (they
// simply fall back to the client's periodic polling).
export function attachLive(io: Server): void {
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string) || '';
      if (token) {
        const { sub } = verifyToken(token);
        const u = (await UserModel.findById(sub).lean()) as ScopeUser | null;
        if (u) (socket.data as { rooms?: string[] }).rooms = roomsForUser(u);
      }
    } catch {
      /* bad/expired token → no scope rooms, still allowed to connect */
    }
    next();
  });
  io.on('connection', (socket) => {
    const rooms = (socket.data as { rooms?: string[] }).rooms;
    if (rooms && rooms.length) socket.join(rooms);
  });
}

// Wire a Redis adapter so io.emit + rooms span MULTIPLE Node instances behind a
// load balancer. No-op (returns false) when REDIS_URL is unset → the default
// in-memory adapter (correct for a single process).
export async function setupRedisAdapter(io: Server): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  // Optional deps — only needed when REDIS_URL is set:
  //   npm i @socket.io/redis-adapter redis
  // @ts-ignore optional dependency, resolved at runtime
  const { createAdapter } = await import('@socket.io/redis-adapter');
  // @ts-ignore optional dependency, resolved at runtime
  const { createClient } = await import('redis');
  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  return true;
}
