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
