import { supabase } from '../lib/supabase';
import offlineStorage from '../services/Offlinestorage';
import PhotoService from './PhotoService';
import * as LotNumberService from './LotNumberService';

class SyncService {
  private isSyncing = false;
  private syncProgress = {
    stage: '',
    current: 0,
    total: 0,
  };
  private progressListeners: Set<(progress: typeof this.syncProgress) => void> = new Set();

  /**
   * Subscribe to sync progress updates
   */
  onProgressChange(callback: (progress: typeof this.syncProgress) => void): () => void {
    this.progressListeners.add(callback);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  private notifyProgress(stage: string, current: number, total: number): void {
    this.syncProgress = { stage, current, total };
    this.progressListeners.forEach(listener => {
      try {
        listener(this.syncProgress);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  /**
   * Initial sync when app opens - syncs active sales only
   */
  async performInitialSync(companyId: string): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    
    try {
      console.log('🔄 Starting initial sync for active sales...');
      this.notifyProgress('Initializing', 0, 5);

      // Step 1: Pull company data
      this.notifyProgress('Syncing company data', 1, 5);
      await this.syncCompanyData(companyId);

      // Step 2: Pull active sales only
      this.notifyProgress('Syncing active sales', 2, 5);
      const activeSales = await this.syncActiveSales(companyId);

      // Step 3: Pull lots for active sales
      this.notifyProgress('Syncing items', 3, 5);
      await this.syncLotsForActiveSales(activeSales);

      // Step 4: Pull photo metadata for active sales
      this.notifyProgress('Syncing photo data', 4, 5);
      await this.syncPhotosForActiveSales(activeSales);

      // Step 5: Download photo blobs for active sales (in background)
      this.notifyProgress('Downloading photos', 5, 5);
      this.downloadPhotoBlobsInBackground(activeSales);

      // Push any pending local changes
      await this.pushLocalChanges();

      await offlineStorage.setLastSyncTime(Date.now());
      console.log('✅ Initial sync completed successfully');
      this.notifyProgress('Complete', 5, 5);
    } catch (error) {
      console.error('❌ Initial sync failed:', error);
      this.notifyProgress('Error', 0, 0);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync company data
   */
  private async syncCompanyData(companyId: string): Promise<void> {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error) throw error;
    if (data) {
      await offlineStorage.upsertCompany(data);
    }
  }

  /**
   * Sync only active and upcoming sales (not completed/archived)
   */
  private async syncActiveSales(companyId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['upcoming', 'active'])
      .order('start_date', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`📦 Found ${data.length} active sales`);
      for (const sale of data) {
        await offlineStorage.upsertSale(sale);
      }
    }

    return data || [];
  }

  /**
   * Sync lots for active sales only
   */
  private async syncLotsForActiveSales(activeSales: any[]): Promise<void> {
    if (activeSales.length === 0) return;

    const saleIds = activeSales.map(s => s.id);
    
    const { data, error } = await supabase
      .from('lots')
      .select('*')
      .in('sale_id', saleIds);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`📋 Found ${data.length} items for active sales`);
      for (const lot of data) {
        await offlineStorage.upsertLot(lot);
      }
    }
  }

  /**
   * Sync photo metadata for active sales
   */
  private async syncPhotosForActiveSales(activeSales: any[]): Promise<void> {
    if (activeSales.length === 0) return;

    // Get all lot IDs for active sales
    const saleIds = activeSales.map(s => s.id);
    
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('id')
      .in('sale_id', saleIds);

    if (lotsError) throw lotsError;
    if (!lots || lots.length === 0) return;

    const lotIds = lots.map(l => l.id);

    // Get photo metadata
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .in('lot_id', lotIds);

    if (photosError) throw photosError;

    if (photos && photos.length > 0) {
      console.log(`🖼️  Found ${photos.length} photos for active sales`);
      for (const photo of photos) {
        await offlineStorage.upsertPhoto({ ...photo, synced: true });
      }
    }
  }

  /**
   * Download photo blobs in background (non-blocking)
   */
  private async downloadPhotoBlobsInBackground(activeSales: any[]): Promise<void> {
    // Don't await this - let it run in background
    setTimeout(async () => {
      try {
        if (activeSales.length === 0) return;

        const saleIds = activeSales.map(s => s.id);
        
        const { data: lots } = await supabase
          .from('lots')
          .select('id')
          .in('sale_id', saleIds);

        if (!lots) return;

        for (const lot of lots) {
          try {
            const result = await PhotoService.downloadPhotosForLot(lot.id);
            if (result.success > 0) {
              console.log(`✅ Downloaded ${result.success} photos for lot ${lot.id}`);
            }
          } catch (error) {
            console.debug('Photo download failed for lot', lot.id, ':', error);
          }
        }

        console.log('🖼️  Background photo download complete');
      } catch (error) {
        console.debug('Background photo download error:', error);
      }
    }, 1000); // Start after 1 second delay
  }

  /**
   * Full sync - all data including completed sales
   */
  async performFullSync(companyId: string): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;

    try {
      console.log('🔄 Starting full sync...');
      this.notifyProgress('Full sync in progress', 0, 4);

      // Clear local storage
      await offlineStorage.clearAll();

      // Pull all data from cloud
      await this.pullAllData(companyId);

      // Replace any temporary lot numbers
      await this.replaceTempLotNumbers();

      console.log('✅ Full sync completed successfully');
      this.notifyProgress('Complete', 4, 4);
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Standard sync - push local changes, pull remote updates
   */
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

      // Step 2: Sync photos (blobs + metadata)
      await this.syncPhotos();

      // Step 3: Replace temporary lot numbers with real sequential numbers
      await this.replaceTempLotNumbers();

      // Step 4: Pull remote changes from cloud
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

    // Handle photo-specific operations
    if (table === 'photos') {
      if (data.operation === 'set_primary') {
        await supabase
          .from('photos')
          .update({ is_primary: false })
          .eq('lot_id', data.lot_id);

        await supabase
          .from('photos')
          .update({ is_primary: true })
          .eq('id', data.photo_id);
        
        return;
      }

      if (type === 'delete') {
        if (data.file_path) {
          await supabase.storage.from('photos').remove([data.file_path]);
        }
        await supabase.from('photos').delete().eq('id', data.id);
        return;
      }

      if (type === 'create') {
        return;
      }
    }

    // Handle standard table operations
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

  /**
   * Sync photos - upload blobs and metadata to Supabase
   */
  private async syncPhotos(): Promise<void> {
    console.log('Syncing photos...');

    try {
      const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
      
      if (unsyncedPhotos.length === 0) {
        console.log('No photos to sync');
        return;
      }

      console.log(`Found ${unsyncedPhotos.length} photos to sync`);

      for (const photo of unsyncedPhotos) {
        try {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          
          if (!blob) {
            console.warn(`No blob found for photo ${photo.id}`);
            continue;
          }

          const uploadResult = await PhotoService.uploadToSupabase(blob, photo.file_path);
          
          if (!uploadResult.success) {
            console.error(`Failed to upload photo ${photo.id}:`, uploadResult.error);
            continue;
          }

          const metadataSaved = await PhotoService.saveMetadataToSupabase({
            id: photo.id,
            lot_id: photo.lot_id,
            file_path: photo.file_path,
            file_name: photo.file_name,
            is_primary: photo.is_primary,
            created_at: photo.created_at || new Date().toISOString(),
            updated_at: photo.updated_at || new Date().toISOString(),
          });

          if (metadataSaved) {
            console.log(`Successfully synced photo ${photo.id}`);
          } else {
            console.error(`Failed to save metadata for photo ${photo.id}`);
          }
        } catch (error) {
          console.error(`Error syncing photo ${photo.id}:`, error);
        }
      }

      console.log('Photo sync completed');
    } catch (error) {
      console.error('Error in photo sync:', error);
    }
  }

  private async replaceTempLotNumbers(): Promise<void> {
    console.log('Replacing temporary lot numbers...');

    try {
      const { data: sales, error } = await supabase
        .from('sales')
        .select('id');

      if (error) throw error;

      if (!sales || sales.length === 0) {
        console.log('No sales found');
        return;
      }

      for (const sale of sales) {
        await LotNumberService.reassignTemporaryNumbers(sale.id);
      }

      console.log('Temporary lot numbers replaced successfully');
    } catch (error) {
      console.error('Error replacing temporary lot numbers:', error);
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    console.log('Pulling remote changes from cloud...');
    
    const lastSyncTime = await offlineStorage.getLastSyncTime();
    
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (companiesError) throw companiesError;

    if (companies && companies.length > 0) {
      console.log(`Pulled ${companies.length} updated companies`);
      for (const company of companies) {
        await offlineStorage.upsertCompany(company);
      }
    }

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

    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (photosError) throw photosError;

    if (photos && photos.length > 0) {
      console.log(`Pulled ${photos.length} updated photos metadata`);
      for (const photo of photos) {
        await offlineStorage.upsertPhoto({ ...photo, synced: true });
        
        try {
          const { data: blob, error: downloadError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (!downloadError && blob) {
            await offlineStorage.upsertPhotoBlob(photo.id, blob);
          }
        } catch (downloadError) {
          console.debug(`Failed to download photo ${photo.id}:`, downloadError);
        }
      }
    }

    await offlineStorage.setLastSyncTime(Date.now());
    console.log('Remote changes pulled successfully');
  }

  private async pullAllData(companyId: string): Promise<void> {
    console.log('Pulling all data from cloud...');

    // Company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError) throw companyError;
    if (company) {
      await offlineStorage.upsertCompany(company);
    }

    // All sales
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .eq('company_id', companyId);

    if (salesError) throw salesError;

    if (sales) {
      for (const sale of sales) {
        await offlineStorage.upsertSale(sale);
      }
    }

    // All lots
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('*');

    if (lotsError) throw lotsError;

    if (lots) {
      for (const lot of lots) {
        await offlineStorage.upsertLot(lot);
      }
    }

    // All photos metadata
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*');

    if (photosError) throw photosError;

    if (photos) {
      for (const photo of photos) {
        await offlineStorage.upsertPhoto({ ...photo, synced: true });
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
    unsyncedPhotosCount: number;
    tempLotNumbersCount: number;
    lastSyncTime: number;
    isSyncing: boolean;
  }> {
    const pendingItems = await offlineStorage.getPendingSyncItems();
    const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
    const lastSyncTime = await offlineStorage.getLastSyncTime();

    return {
      pendingCount: pendingItems.length,
      unsyncedPhotosCount: unsyncedPhotos.length,
      tempLotNumbersCount: 0,
      lastSyncTime,
      isSyncing: this.isSyncing,
    };
  }

  getSyncProgress() {
    return this.syncProgress;
  }

  isSyncInProgress() {
    return this.isSyncing;
  }
}

export default new SyncService();