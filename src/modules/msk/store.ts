// Checks the member has done, kept on this phone (SQLite, the shell's database).
// One row per check, with Sency's whole summary, so a later version can send
// them to the member's EmbraceHealthAI record without asking them to redo one.

import { db } from '@/shell/storage';

import { readSummary, type CheckKind, type CheckResult } from './sency';

export type SavedCheck = CheckResult & { kind: CheckKind; at: number };

type Row = { kind: string; finished_at: number; finished: number; summary_json: string };

let ready = false;
const table = () => {
  if (!ready) {
    db().execSync(
      `CREATE TABLE IF NOT EXISTS msk_checks (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         member_id INTEGER NOT NULL,
         kind TEXT NOT NULL,
         finished_at INTEGER NOT NULL,
         finished INTEGER NOT NULL,
         total_score INTEGER,
         summary_json TEXT NOT NULL
       )`,
    );
    ready = true;
  }
  return db();
};

export const saveCheck = (memberId: number, kind: CheckKind, result: CheckResult, at: number = Date.now()) => {
  table().runSync(
    'INSERT INTO msk_checks (member_id, kind, finished_at, finished, total_score, summary_json) VALUES (?, ?, ?, ?, ?, ?)',
    memberId, kind, at, result.finished ? 1 : 0, result.score, result.raw,
  );
};

/** The member's most recent finished check of this kind, if any. */
export const lastCheck = (memberId: number, kind: CheckKind): SavedCheck | null => {
  const row = table().getFirstSync<Row>(
    'SELECT kind, finished_at, finished, summary_json FROM msk_checks WHERE member_id = ? AND kind = ? AND finished = 1 ORDER BY finished_at DESC LIMIT 1',
    memberId, kind,
  );
  return row ? { ...readSummary(row.summary_json, true), kind, at: row.finished_at } : null;
};
