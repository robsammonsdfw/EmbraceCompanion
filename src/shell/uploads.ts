// ============================================================================
// Uploads that must not be lost (a finished run, later other saves)
// ============================================================================
// enqueueUpload() writes the request to SQLite first, then sends it. A request
// that fails for lack of signal or a server hiccup is retried with growing
// waits (5 s up to 5 min) whenever the app is open, across restarts. One the
// server refuses outright (a 4xx other than 401/408/429) is kept as 'failed'
// with the server's message, never dropped; retryUpload() sends it again.
// A 401 pauses the queue until the member signs in again.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { istride, mainApi } from './api';
import { currentToken } from './auth';
import { HttpError } from './http';
import { db } from './storage';

export type UploadJob = {
  /** Unique per upload, e.g. the run's client_run_id. Enqueueing the same key twice is ignored. */
  key: string;
  api: 'main' | 'istride';
  path: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export type UploadStatus = {
  status: 'pending' | 'done' | 'failed';
  /** The server's JSON response, once done. */
  result: unknown;
  error: string | null;
  attempts: number;
};

type Row = { key: string; api: string; path: string; method: string; body: string | null; status: string; result: string | null; error: string | null; attempts: number };

let ready = false;
const table = () => {
  if (!ready) {
    db().execSync(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        key TEXT PRIMARY KEY,
        api TEXT NOT NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL,
        body TEXT,
        created_at INTEGER NOT NULL,
        next_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        error TEXT
      );
    `);
    ready = true;
  }
  return db();
};

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((l) => l()); };

const parse = (text: string | null) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

export const getUpload = (key: string): UploadStatus | null => {
  const r = table().getFirstSync<Row>('SELECT * FROM upload_queue WHERE key = ?', key);
  return r ? { status: r.status as UploadStatus['status'], result: parse(r.result), error: r.error, attempts: r.attempts } : null;
};

/** Re-renders when any upload changes. */
export const useUpload = (key: string | null) => {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => version);
  return key ? getUpload(key) : null;
};

export const enqueueUpload = (job: UploadJob) => {
  const now = Date.now();
  table().runSync(
    'INSERT OR IGNORE INTO upload_queue (key, api, path, method, body, created_at, next_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    job.key, job.api, job.path, job.method ?? 'POST', job.body === undefined ? null : JSON.stringify(job.body), now, now,
  );
  emit();
  void processUploads();
};

export const retryUpload = (key: string) => {
  table().runSync("UPDATE upload_queue SET status = 'pending', next_at = ?, error = NULL WHERE key = ? AND status != 'done'", Date.now(), key);
  emit();
  void processUploads();
};

const backoff = (attempts: number) => Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
const permanent = (status: number) => status >= 400 && status < 500 && ![401, 408, 429].includes(status);

let running = false;
export const processUploads = async () => {
  if (running || !currentToken()) return;
  running = true;
  try {
    const due = table().getAllSync<Row>(
      "SELECT * FROM upload_queue WHERE status = 'pending' AND next_at <= ? ORDER BY created_at",
      Date.now(),
    );
    for (const job of due) {
      const send = job.api === 'istride' ? istride : mainApi;
      try {
        const result = await send<unknown>(job.path, {
          method: job.method as NonNullable<UploadJob['method']>,
          body: parse(job.body) ?? undefined,
        });
        table().runSync("UPDATE upload_queue SET status = 'done', result = ?, error = NULL WHERE key = ?", JSON.stringify(result ?? null), job.key);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 0;
        const message = (e as Error).message;
        if (status === 401) {
          table().runSync('UPDATE upload_queue SET error = ? WHERE key = ?', message, job.key);
          break; // signed out; picks up again after sign-in
        }
        if (permanent(status)) {
          table().runSync("UPDATE upload_queue SET status = 'failed', attempts = attempts + 1, error = ? WHERE key = ?", message, job.key);
        } else {
          table().runSync(
            'UPDATE upload_queue SET attempts = attempts + 1, next_at = ?, error = ? WHERE key = ?',
            Date.now() + backoff(job.attempts + 1), message, job.key,
          );
        }
      }
      emit();
    }
  } finally {
    running = false;
  }
};

/** Called once at startup (src/app/_layout.tsx): retries every 30 s and when the app comes back. */
export const startUploads = () => {
  void processUploads();
  const timer = setInterval(() => { void processUploads(); }, 30_000);
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void processUploads(); });
  return () => { clearInterval(timer); sub.remove(); };
};
