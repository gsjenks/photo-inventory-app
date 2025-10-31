import { supabase } from '../lib/supabase';
import offlineStorage from '../lib/offlineStorage';

class SyncService {
  private isSyncing = false;

  async performSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    
    try {
      // Step 1: Push local changes to cloud
      await this.pushLocalChanges();

      // Step 2: Pull remote changes from cloud
      await this.pullRemoteChanges();

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushLocalChanges(): Promise<void> {
    const pendingItems = await offlineStorage.getPendingSyncItems();

    for (const item of pendingItems) {
      try {
        await this.applyToCloud(item);
        await offlineStorage.markSynced(item.id);
      } catch (error) {
        console.error('Failed to sync item:', item, error);
        // Continue with other items
      }
    }
  }

  private async applyToCloud(item: any): Promise<void> {
    const { type, table, data } = item;

    switch (type) {
      case 'create':
        await supabase.from(table).insert(data);
        break;
      case 'update':
        await supabase.from(table).update(data).eq('id', data.id);
        break;
      case 'delete':
        await supabase.from(table).delete().eq('id', data.id);
        break;
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    const lastSyncTime = await offlineStorage.getLastSyncTime();
    
    // Fetch companies updated since last sync
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (error) throw error;

    // Store companies locally
    if (companies) {
      for (const company of companies) {
        await offlineStorage.upsertCompany(company);
      }
    }

    // Update last sync time
    await offlineStorage.setLastSyncTime(Date.now());
  }

  async initialize(): Promise<void> {
    await offlineStorage.initialize();
  }
}

export default new SyncService();