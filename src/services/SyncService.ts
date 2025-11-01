import { supabase } from '../lib/supabase';
import offlineStorage from '../services/Offlinestorage';
import * as LotNumberService from './LotNumberService';

class SyncService {
  private isSyncing = false;

  async performSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    
    try {
      console.log('Starting sync process...');

      // Step 1: Push local changes to cloud
      await this.pushLocalChanges();

      // Step 2: Replace temporary lot numbers with real sequential numbers
      await this.replaceTempLotNumbers();

      // Step 3: Pull remote changes from cloud
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
    console.log('Pushing local changes to cloud...');
    
    const pendingItems = await offlineStorage.getPendingSyncItems();

    if (pendingItems.length === 0) {
      console.log('No pending items to sync');
      return;
    }

    console.log(`Found ${pendingItems.length} pending items to sync`);

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

  private async replaceTempLotNumbers(): Promise<void> {
    console.log('Replacing temporary lot numbers...');

    try {
      // Get all sales that have lots with temporary numbers
      const { data: sales, error } = await supabase
        .from('sales')
        .select('id');

      if (error) throw error;

      if (!sales || sales.length === 0) {
        console.log('No sales found');
        return;
      }

      // Replace temporary lot numbers for each sale
      for (const sale of sales) {
        await LotNumberService.reassignTemporaryNumbers(sale.id);
      }

      console.log('Temporary lot numbers replaced successfully');
    } catch (error) {
      console.error('Error replacing temporary lot numbers:', error);
      // Don't throw - continue with sync even if this fails
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    console.log('Pulling remote changes from cloud...');
    
    const lastSyncTime = await offlineStorage.getLastSyncTime();
    
    // Fetch companies updated since last sync
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (companiesError) throw companiesError;

    // Store companies locally
    if (companies && companies.length > 0) {
      console.log(`Pulled ${companies.length} updated companies`);
      for (const company of companies) {
        await offlineStorage.upsertCompany(company);
      }
    }

    // Fetch sales updated since last sync
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (salesError) throw salesError;

    if (sales && sales.length > 0) {
      console.log(`Pulled ${sales.length} updated sales`);
      for (const sale of sales) {
        await offlineStorage.upsertSale(sale);
      }
    }

    // Fetch lots updated since last sync
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (lotsError) throw lotsError;

    if (lots && lots.length > 0) {
      console.log(`Pulled ${lots.length} updated lots`);
      for (const lot of lots) {
        await offlineStorage.upsertLot(lot);
      }
    }

    // Update last sync time
    await offlineStorage.setLastSyncTime(Date.now());
    console.log('Remote changes pulled successfully');
  }


  /**
   * Full sync - clear local data and pull everything from cloud
   * Use this when you want to completely reset to cloud state
   */
  async performFullSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;

    try {
      console.log('Starting full sync...');

      // Clear local storage
      await offlineStorage.clearAll();

      // Pull all data from cloud
      await this.pullAllData();

      // Replace any temporary lot numbers
      await this.replaceTempLotNumbers();

      console.log('Full sync completed successfully');
    } catch (error) {
      console.error('Full sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async pullAllData(): Promise<void> {
    console.log('Pulling all data from cloud...');

    // Fetch all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*');

    if (companiesError) throw companiesError;

    if (companies) {
      for (const company of companies) {
        await offlineStorage.upsertCompany(company);
      }
    }

    // Fetch all sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*');

    if (salesError) throw salesError;

    if (sales) {
      for (const sale of sales) {
        await offlineStorage.upsertSale(sale);
      }
    }

    // Fetch all lots
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('*');

    if (lotsError) throw lotsError;

    if (lots) {
      for (const lot of lots) {
        await offlineStorage.upsertLot(lot);
      }
    }

    await offlineStorage.setLastSyncTime(Date.now());
  }

  async initialize(): Promise<void> {
    await offlineStorage.initialize();
  }

  /**
   * Get sync status information
   */
  async getSyncStatus(): Promise<{
    pendingCount: number;
    tempLotNumbersCount: number;
    lastSyncTime: number;
    isSyncing: boolean;
  }> {
    const pendingItems = await offlineStorage.getPendingSyncItems();
    const lastSyncTime = await offlineStorage.getLastSyncTime();
    const tempLotNumbersCount = 0; // TODO: Implement getPendingTempCount() in LotNumberService

    return {
      pendingCount: pendingItems.length,
      tempLotNumbersCount,
      lastSyncTime,
      isSyncing: this.isSyncing,
    };
  }
}

export default new SyncService();