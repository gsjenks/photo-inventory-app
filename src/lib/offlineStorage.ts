import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

interface PhotoInventoryDB extends DBSchema {
  companies: {
    key: string;
    value: any;
    indexes: { 'by-updated': string };
  };
  sales: {
    key: string;
    value: any;
    indexes: { 'by-company': string; 'by-updated': string };
  };
  lots: {
    key: string;
    value: any;
    indexes: { 'by-sale': string; 'by-updated': string };
  };
  photos: {
    key: string;
    value: any;
    indexes: { 'by-lot': string };
  };
  pendingSync: {
    key: string;
    value: {
      id: string;
      type: 'create' | 'update' | 'delete';
      table: string;
      data: any;
      timestamp: number;
      synced: boolean;
    };
    indexes: { 'by-synced': string };
  };
  conflicts: {
    key: string;
    value: {
      id: string;
      table: string;
      localData: any;
      cloudData: any;
      timestamp: number;
      resolved: boolean;
    };
  };
  metadata: {
    key: string;
    value: any;
  };
}

class OfflineStorage {
  private db: IDBPDatabase<PhotoInventoryDB> | null = null;
  private readonly DB_NAME = 'PhotoInventoryDB';
  private readonly DB_VERSION = 2;

  async initialize(): Promise<void> {
    this.db = await openDB<PhotoInventoryDB>(this.DB_NAME, this.DB_VERSION, {
      upgrade(db) {
        // Companies store
        if (!db.objectStoreNames.contains('companies')) {
          const companyStore = db.createObjectStore('companies', { keyPath: 'id' });
          companyStore.createIndex('by-updated', 'updated_at');
        }

        // Sales store
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('by-company', 'company_id');
          salesStore.createIndex('by-updated', 'updated_at');
        }

        // Lots store
        if (!db.objectStoreNames.contains('lots')) {
          const lotsStore = db.createObjectStore('lots', { keyPath: 'id' });
          lotsStore.createIndex('by-sale', 'sale_id');
          lotsStore.createIndex('by-updated', 'updated_at');
        }

        // Photos store
        if (!db.objectStoreNames.contains('photos')) {
          const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
          photosStore.createIndex('by-lot', 'lot_id');
        }

        // Pending sync operations
        if (!db.objectStoreNames.contains('pendingSync')) {
          const syncStore = db.createObjectStore('pendingSync', { keyPath: 'id' });
          syncStore.createIndex('by-synced', 'synced');
        }

        // Conflicts store
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'id' });
        }

        // Metadata store (for sync timestamps, etc.)
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });
  }

  // Companies
  async upsertCompany(company: any): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('companies', company);
  }

  async getCompany(id: string): Promise<any> {
    if (!this.db) await this.initialize();
    return await this.db!.get('companies', id);
  }

  async getAllCompanies(): Promise<any[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAll('companies');
  }

  // Sales
  async upsertSale(sale: any): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('sales', sale);
  }

  async getSale(id: string): Promise<any> {
    if (!this.db) await this.initialize();
    return await this.db!.get('sales', id);
  }

  async getSalesByCompany(companyId: string): Promise<any[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('sales', 'by-company', companyId);
  }

  // Lots
  async upsertLot(lot: any): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('lots', lot);
  }

  async getLot(id: string): Promise<any> {
    if (!this.db) await this.initialize();
    return await this.db!.get('lots', id);
  }

  async getLotsBySale(saleId: string): Promise<any[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('lots', 'by-sale', saleId);
  }

  // Generic upsert for any table
  async upsertItem(table: string, item: any): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put(table as any, item);
  }

  // Pending sync operations
  async addPendingSyncItem(item: {
    id: string;
    type: 'create' | 'update' | 'delete';
    table: string;
    data: any;
  }): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('pendingSync', {
      ...item,
      timestamp: Date.now(),
      synced: false,
    });
  }

  async getPendingSyncItems(): Promise<any[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('pendingSync', 'by-synced');
  }

  async markSynced(itemId: string): Promise<void> {
    if (!this.db) await this.initialize();
    const item = await this.db!.get('pendingSync', itemId);
    if (item) {
      item.synced = true;
      await this.db!.put('pendingSync', item);
    }
  }

  async clearSyncedItems(): Promise<void> {
    if (!this.db) await this.initialize();
    const syncedItems = await this.db!.getAllFromIndex('pendingSync', 'by-synced');
    const tx = this.db!.transaction('pendingSync', 'readwrite');
    for (const item of syncedItems) {
      await tx.store.delete(item.id);
    }
    await tx.done;
  }

  // Conflicts
  async addConflict(conflict: {
    id: string;
    table: string;
    localData: any;
    cloudData: any;
  }): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('conflicts', {
      ...conflict,
      timestamp: Date.now(),
      resolved: false,
    });
  }

  async getConflictedItems(): Promise<any[]> {
    if (!this.db) await this.initialize();
    const allConflicts = await this.db!.getAll('conflicts');
    return allConflicts.filter(c => !c.resolved);
  }

  async markConflictResolved(itemId: string): Promise<void> {
    if (!this.db) await this.initialize();
    const conflict = await this.db!.get('conflicts', itemId);
    if (conflict) {
      conflict.resolved = true;
      await this.db!.put('conflicts', conflict);
    }
  }

  // Metadata (for sync timestamps, etc.)
  async setLastSyncTime(timestamp: number): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('metadata', { key: 'lastSyncTime', value: timestamp });
  }

  async getLastSyncTime(): Promise<number> {
    if (!this.db) await this.initialize();
    const metadata = await this.db!.get('metadata', 'lastSyncTime');
    return metadata?.value || 0;
  }

  // Clear all data
  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    const stores = ['companies', 'sales', 'lots', 'photos', 'pendingSync', 'conflicts', 'metadata'];
    const tx = this.db!.transaction(stores as any, 'readwrite');
    
    for (const store of stores) {
      await tx.objectStore(store as any).clear();
    }
    
    await tx.done;
  }

  // Close database connection
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default new OfflineStorage();