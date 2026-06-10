// ============================================================
//  API CLIENT + SOCKET
//  Central place for all backend calls. Attaches the JWT bearer
//  token (set at login) to every request so the backend can
//  authenticate the user and scope data correctly.
// ============================================================
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const TOKEN_KEY = 'sf_token';

// token is held in module scope so the interceptor can read it
let token: string | null = localStorage.getItem(TOKEN_KEY);

export function setAuthToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  clearGetCache(); // never serve one user's cached data to another
}

export function getAuthToken(): string | null {
  return token;
}

// In production the API + socket live on a different origin (e.g. a Render backend).
// Set VITE_API_URL at build time → e.g. https://smartfactory-api.onrender.com
// In dev it stays '' so the Vite proxy forwards /api and /socket.io to localhost:4000.
const API_BASE = (import.meta.env as Record<string, string | undefined>).VITE_API_URL || '';

export const api = axios.create({ baseURL: API_BASE });

// attach the bearer token to every request
api.interceptors.request.use((config) => {
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// on 401 (expired/invalid token) clear it and bounce to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      setAuthToken(null);
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    }
    return Promise.reject(err);
  }
);

// ============================================================
//  SHARED GET CACHE + IN-FLIGHT DE-DUPLICATION
//  Many components mount the same polling hooks (e.g. the Topbar
//  and the open page both want /api/machines). Without sharing,
//  each fires its own request — the Network tab fills with
//  duplicate 68 kB machine fetches that also starve other calls.
//
//  This collapses identical GETs two ways:
//   1. in-flight: a second request for a URL already in flight
//      reuses the same promise (concurrent dedupe).
//   2. micro-cache: a fresh result (< TTL) is returned without a
//      network call — perfect for a live monitor where the server
//      already caches telemetry for ~2s. Pass {force:true} after a
//      mutation to bypass and refetch.
// ============================================================
const GET_TTL = 2500;
const getCache = new Map<string, { ts: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedGet<T>(url: string, opts?: { ttl?: number; force?: boolean }): Promise<T> {
  const ttl = opts?.ttl ?? GET_TTL;
  // always collapse concurrent requests to the same URL (even forced ones)
  const flying = inflight.get(url);
  if (flying) return flying as Promise<T>;
  // force bypasses only the freshness cache (used after a mutation / on socket nudge)
  if (!opts?.force) {
    const hit = getCache.get(url);
    if (hit && Date.now() - hit.ts < ttl) return hit.data as T;
  }
  const p = api
    .get<T>(url)
    .then((r) => {
      getCache.set(url, { ts: Date.now(), data: r.data });
      inflight.delete(url);
      return r.data;
    })
    .catch((e) => {
      inflight.delete(url);
      throw e;
    });
  inflight.set(url, p);
  return p as Promise<T>;
}

export function clearGetCache() {
  getCache.clear();
  inflight.clear();
}

// ---- socket (live updates) ----
let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || '/', { path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}
