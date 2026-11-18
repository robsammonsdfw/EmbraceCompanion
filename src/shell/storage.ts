// On-device storage (SQLite). One database for the whole app; each feature
// creates its own tables with CREATE TABLE IF NOT EXISTS when first used.

import * as SQLite from 'expo-sqlite';

let database: SQLite.SQLiteDatabase | null = null;

export const db = (): SQLite.SQLiteDatabase => {
  if (!database) {
    database = SQLite.openDatabaseSync('companion.db');
    database.execSync('PRAGMA journal_mode = WAL;');
  }
  return database;
};

// Small settings that belong to the shell (theme, the last heart-rate strap…).
let prefsReady = false;
const prefs = () => {
  if (!prefsReady) {
    db().execSync('CREATE TABLE IF NOT EXISTS shell_prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    prefsReady = true;
  }
  return db();
};

export const getShellPref = (key: string): string | null =>
  prefs().getFirstSync<{ value: string }>('SELECT value FROM shell_prefs WHERE key = ?', key)?.value ?? null;

export const setShellPref = (key: string, value: string) => {
  prefs().runSync('INSERT OR REPLACE INTO shell_prefs (key, value) VALUES (?, ?)', key, value);
};
