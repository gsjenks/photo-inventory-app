// services/SyncService.ts
import { supabase } from '../lib/supabase';
import { OfflineStorage } from '../lib/offlineStorage';

export class SyncService {
  private storage: OfflineStorage;

  constructor() {
    this.storage = new OfflineStorage();
  }

  async performSync() {
    console.log('Starting sync...');
    
    // Step 1: Push local changes to cloud
    await this.pushLocalChanges();
    
    // Step 2: Pull cloud changes to local
    await this.pullCloudChanges();
    
    console.log('Sync complete');
  }

  async pushLocalChanges() {
    // Get pending items from sync queue
    const pendingItems = await this.storage.getPendingSyncItems();
    
    for (const item of pendingItems) {
      try {
        // Apply to Supabase with conflict resolution
        await this.applyToCloud(item);
        
        // Mark as synced
        await this.storage.markSynced(item.id);
      } catch (error) {
        console.error('Sync error:', error);
        // Keep in queue for retry
      }
    }
  }

  async pullCloudChanges() {
    // Get last sync timestamp
    const lastSync = await this.storage.getLastSyncTime();
    
    // Pull changes from Supabase since last sync
    const { data: companies } = await supabase
      .from('companies')
      .select('*')
      .gte('updated_at', lastSync);
    
    // Update local database
    for (const company of companies || []) {
      await this.storage.upsertCompany(company);
    }
    
    // Update last sync time
    await this.storage.setLastSyncTime(new Date().toISOString());
  }

  async resolveConflict(localData: any, cloudData: any) {
    // Cloud is source of truth (as per your requirements)
    // Compare timestamps
    if (new Date(cloudData.updated_at) > new Date(localData.updated_at)) {
      return cloudData; // Cloud wins
    }
    return localData;
  }
}