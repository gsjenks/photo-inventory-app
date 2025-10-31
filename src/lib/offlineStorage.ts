// lib/offlineStorage.ts
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

export class OfflineStorage {
  private sqlite: SQLiteConnection;
  private db: any;

  async initialize() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    
    // Create local database schema matching Supabase
    await this.createTables();
  }

  async createTables() {
    // Mirror your Supabase schema locally
    const schema = `
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        sync_status TEXT DEFAULT 'synced'
      );
      
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        name TEXT,
        status TEXT,
        created_at TEXT,
        updated_at TEXT,
        sync_status TEXT DEFAULT 'synced'
      );
      
      CREATE TABLE IF NOT EXISTS lots (
        id TEXT PRIMARY KEY,
        sale_id TEXT,
        lot_number INTEGER,
        name TEXT,
        created_at TEXT,
        updated_at TEXT,
        sync_status TEXT DEFAULT 'synced'
      );
      
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        lot_id TEXT,
        file_path TEXT,
        is_primary BOOLEAN,
        created_at TEXT,
        updated_at TEXT,
        sync_status TEXT DEFAULT 'synced'
      );
      
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT,
        record_id TEXT,
        operation TEXT,
        data TEXT,
        timestamp TEXT,
        status TEXT DEFAULT 'pending'
      );
    `;
    
    await this.db.execute(schema);
  }

  // CRUD operations that work offline
  async createRecord(table: string, data: any) {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    // Add to sync queue
    await this.addToSyncQueue(table, id, 'insert', {
      ...data,
      id,
      created_at: timestamp,
      updated_at: timestamp,
      sync_status: 'pending'
    });
    
    return { id, ...data };
  }

  async addToSyncQueue(table: string, recordId: string, operation: string, data: any) {
    await this.db.execute({
      statement: `INSERT INTO sync_queue (table_name, record_id, operation, data, timestamp) VALUES (?, ?, ?, ?, ?)`,
      values: [table, recordId, operation, JSON.stringify(data), new Date().toISOString()]
    });
  }
}