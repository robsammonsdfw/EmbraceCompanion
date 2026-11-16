// Plain JSON requests. Every request names the Companion in User-Agent, which
// is how the member's device list labels it ("iPhone · EmbraceHealthAI Companion").

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export class HttpError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
  }
}

export const USER_AGENT =
  `EmbraceHealthAICompanion/${Constants.expoConfig?.version ?? '0'} ` +
  `(${Platform.OS === 'ios' ? 'iPhone' : 'Android'}; ${Platform.OS} ${String(Platform.Version)})`;

export type RequestInit = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
};

export const request = async <T>(base: string, path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new HttpError(res.status, typeof message === 'string' ? message : `Request failed (${res.status})`, data);
  }
  return data as T;
};
