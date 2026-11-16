// ============================================================================
// Signing in (COMPANION_APP_PLAN.md §2.2)
//   - From a web app: the link's one-time code (h=) is traded at
//     POST /companion/exchange for the Companion's own session.
//   - From the icon: email and password, the same login as the web apps.
// The session lives in secure storage (Keychain / Keystore) and nowhere else.
// Both the main API and iStride accept the token. A 401 from either means the
// session was ended (signed out elsewhere, or "sign out everywhere").
// ============================================================================

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { MAIN_API_URL } from './config';
import { request } from './http';

export type Member = { id: number; email: string; firstName: string | null };
type Session = { token: string; member: Member };
type ServerUser = { id: number; email: string; first_name?: string | null };

const KEY = 'embracehealthai.session';

/** undefined until read from secure storage. */
let session: Session | null | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const toMember = (u: ServerUser): Member => ({ id: u.id, email: u.email, firstName: u.first_name ?? null });

const save = async (next: Session | null) => {
  session = next;
  emit();
  try {
    if (next) await SecureStore.setItemAsync(KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // The session still works for this launch; it just won't survive a restart.
  }
};

export const loadSession = async (): Promise<Session | null> => {
  if (session !== undefined) return session;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    session = null;
  }
  emit();
  return session;
};

export const currentToken = () => session?.token ?? null;
export const currentMember = () => session?.member ?? null;

/** undefined while loading, null when signed out. */
export const useSession = () =>
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => session,
    () => session,
  );

const endOnServer = (token: string) =>
  request(MAIN_API_URL, '/auth/logout', { method: 'POST', token }).catch(() => undefined);

export const signIn = async (email: string, password: string) => {
  const r = await request<{ token: string; user: ServerUser }>(MAIN_API_URL, '/auth/customer-login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
  await save({ token: r.token, member: toMember(r.user) });
};

/**
 * Trades a link's code for a session. Returns the member it's for and whether
 * that's someone other than who's signed in now, without switching yet.
 */
export const exchangeCode = async (code: string) => {
  const r = await request<{ token: string; user: ServerUser }>(MAIN_API_URL, '/companion/exchange', {
    method: 'POST',
    body: {
      code,
      device: { platform: Platform.OS, osVersion: String(Platform.Version), appVersion: Constants.expoConfig?.version ?? null },
    },
  });
  const incoming: Session = { token: r.token, member: toMember(r.user) };
  const current = session ?? null;
  return {
    member: incoming.member,
    isSwitch: !!current && current.member.id !== incoming.member.id,
    accept: () => save(incoming),
    // Ends the unused session so it doesn't sit in the member's device list.
    decline: () => endOnServer(incoming.token),
  };
};

/** Signs out here, and ends the session on the server unless it already ended. */
export const signOut = async (opts: { alreadyEnded?: boolean } = {}) => {
  const token = session?.token;
  await save(null);
  if (token && !opts.alreadyEnded) await endOnServer(token);
};
