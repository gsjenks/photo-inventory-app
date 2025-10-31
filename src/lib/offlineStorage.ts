// Offline Storage Service
// Note: Capacitor and SQLite functionality removed/commented out for build

export interface SyncItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  synced: boolean;
}

class OfflineStorage {
  // Removed unused sqlite property
  // If SQLite is needed, initialize it properly in constructor or as optional
  
  async initialize(): Promise<void> {
    // Initialize offline storage
    console.log('Offline storage initialized');
  }

  async getPendingSyncItems(): Promise<SyncItem[]> {
    // Return pending sync items from local storage
    const items = localStorage.getItem('pendingSyncItems');
    return items ? JSON.parse(items) : [];
  }

  async markSynced(itemId: string): Promise<void> {
    // Mark an item as synced
    const items = await this.getPendingSyncItems();
    const updated = items.filter(item => item.id !== itemId);
    localStorage.setItem('pendingSyncItems', JSON.stringify(updated));
  }

  async getLastSyncTime(): Promise<number> {
    // Get last sync timestamp
    const time = localStorage.getItem('lastSyncTime');
    return time ? parseInt(time) : 0;
  }

  async setLastSyncTime(timestamp: number): Promise<void> {
    // Set last sync timestamp
    localStorage.setItem('lastSyncTime', timestamp.toString());
  }

  async upsertCompany(company: any): Promise<void> {
    // Store company data locally
    const companies = localStorage.getItem('companies');
    const companyList = companies ? JSON.parse(companies) : [];
    const existingIndex = companyList.findIndex((c: any) => c.id === company.id);
    
    if (existingIndex >= 0) {
      companyList[existingIndex] = company;
    } else {
      companyList.push(company);
    }
    
    localStorage.setItem('companies', JSON.stringify(companyList));
  }

  async addPendingSyncItem(item: Omit<SyncItem, 'id' | 'timestamp' | 'synced'>): Promise<void> {
    const items = await this.getPendingSyncItems();
    const newItem: SyncItem = {
      ...item,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      synced: false,
    };
    items.push(newItem);
    localStorage.setItem('pendingSyncItems', JSON.stringify(items));
  }
}

export default new OfflineStorage();