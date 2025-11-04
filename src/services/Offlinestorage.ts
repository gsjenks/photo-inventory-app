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
    indexes: { 'by-lot': string; 'by-synced': string };
  };
  photoBlobs: {
    key: string;
    value: { id: string; blob: Blob };
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
  private readonly DB_VERSION = 3;

  async initialize(): Promise<void> {
    try {
      this.db = await openDB<PhotoInventoryDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          // Version 1: Initial setup
          if (oldVersion < 1) {
            const companyStore = db.createObjectStore('companies', { keyPath: 'id' });
            companyStore.createIndex('by-updated', 'updated_at');
            
            const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
            salesStore.createIndex('by-company', 'company_id');
            salesStore.createIndex('by-updated', 'updated_at');
            
            const lotsStore = db.createObjectStore('lots', { keyPath: 'id' });
            lotsStore.createIndex('by-sale', 'sale_id');
            lotsStore.createIndex('by-updated', 'updated_at');
            
            const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
            photosStore.createIndex('by-lot', 'lot_id');
            
            const syncStore = db.createObjectStore('pendingSync', { keyPath: 'id' });
            syncStore.createIndex('by-synced', 'synced');
            
            db.createObjectStore('conflicts', { keyPath: 'id' });
            db.createObjectStore('metadata', { keyPath: 'key' });
          }
          
          // Version 3: Add photo blobs and synced index
          if (oldVersion < 3) {
            // Create photoBlobs store
            if (!db.objectStoreNames.contains('photoBlobs')) {
              db.createObjectStore('photoBlobs', { keyPath: 'id' });
            }
            
            // Add synced index to photos store
            if (db.objectStoreNames.contains('photos')) {
              const photosStore = transaction.objectStore('photos');
              if (!photosStore.indexNames.contains('by-synced')) {
                photosStore.createIndex('by-synced', 'synced');
              }
            }
          }
        },
      });
    } catch (error: any) {
      if (error.name === 'VersionError') {
        console.warn('Database version conflict. Clearing and recreating...');
        await this.deleteDatabase();
        
        // Recreate database from scratch
        this.db = await openDB<PhotoInventoryDB>(this.DB_NAME, this.DB_VERSION, {
          upgrade(db) {
            const companyStore = db.createObjectStore('companies', { keyPath: 'id' });
            companyStore.createIndex('by-updated', 'updated_at');
            
            const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
            salesStore.createIndex('by-company', 'company_id');
            salesStore.createIndex('by-updated', 'updated_at');
            
            const lotsStore = db.createObjectStore('lots', { keyPath: 'id' });
            lotsStore.createIndex('by-sale', 'sale_id');
            lotsStore.createIndex('by-updated', 'updated_at');
            
            const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
            photosStore.createIndex('by-lot', 'lot_id');
            photosStore.createIndex('by-synced', 'synced');
            
            db.createObjectStore('photoBlobs', { keyPath: 'id' });
            
            const syncStore = db.createObjectStore('pendingSync', { keyPath: 'id' });
            syncStore.createIndex('by-synced', 'synced');
            
            db.createObjectStore('conflicts', { keyPath: 'id' });
            db.createObjectStore('metadata', { keyPath: 'key' });
          },
        });
      } else {
        throw error;
      }
    }
  }

  private async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    return new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(this.DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

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

  async upsertPhoto(photo: any): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('photos', photo);
  }

  async getPhoto(id: string): Promise<any> {
    if (!this.db) await this.initialize();
    return await this.db!.get('photos', id);
  }

  async getPhotosByLot(lotId: string): Promise<any[]> {
    if (!this.db) await this.initialize();
    return await this.db!.getAllFromIndex('photos', 'by-lot', lotId);
  }

  async getUnsyncedPhotos(): Promise<any[]> {
    if (!this.db) await this.initialize();
    const allPhotos = await this.db!.getAll('photos');
    return allPhotos.filter(p => !p.synced);
  }

  async deletePhoto(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.delete('photos', id);
  }

  async upsertPhotoBlob(photoId: string, blob: Blob): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('photoBlobs', { id: photoId, blob });
  }

  async getPhotoBlob(photoId: string): Promise<Blob | undefined> {
    if (!this.db) await this.initialize();
    const result = await this.db!.get('photoBlobs', photoId);
    return result?.blob;
  }

  async deletePhotoBlob(photoId: string): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.delete('photoBlobs', photoId);
  }

  async upsertItem(table: string, item: any): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put(table as any, item);
  }

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
    const allItems = await this.db!.getAll('pendingSync');
    return allItems.filter(item => !item.synced);
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
    const allItems = await this.db!.getAll('pendingSync');
    const syncedItems = allItems.filter(item => item.synced);
    
    for (const item of syncedItems) {
      await this.db!.delete('pendingSync', item.id);
    }
  }

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

  async setLastSyncTime(timestamp: number): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.put('metadata', { key: 'lastSyncTime', value: timestamp });
  }

  async getLastSyncTime(): Promise<number> {
    if (!this.db) await this.initialize();
    const metadata = await this.db!.get('metadata', 'lastSyncTime');
    return metadata?.value || 0;
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();
    
    await this.db!.clear('companies');
    await this.db!.clear('sales');
    await this.db!.clear('lots');
    await this.db!.clear('photos');
    await this.db!.clear('photoBlobs');
    await this.db!.clear('pendingSync');
    await this.db!.clear('conflicts');
    await this.db!.clear('metadata');
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default new OfflineStorage();