import { supabase } from '../lib/supabase';
import offlineStorage from '../services/Offlinestorage';
import PhotoService from './PhotoService';
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
        // Handle set primary photo operation
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
        // Delete photo from storage
        if (data.file_path) {
          await supabase.storage.from('photos').remove([data.file_path]);
        }
        // Delete record
        await supabase.from('photos').delete().eq('id', data.id);
        return;
      }

      if (type === 'create') {
        // Photo creation is handled in syncPhotos() method
        // This entry just marks that a photo needs to be uploaded
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
      // Get all unsynced photos from IndexedDB
      const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
      
      if (unsyncedPhotos.length === 0) {
        console.log('No photos to sync');
        return;
      }

      console.log(`Found ${unsyncedPhotos.length} photos to sync`);

      for (const photo of unsyncedPhotos) {
        try {
          // Get the photo blob
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          
          if (!blob) {
            console.warn(`No blob found for photo ${photo.id}`);
            continue;
          }

          // Upload to Supabase Storage
          const uploadResult = await PhotoService.uploadToSupabase(blob, photo.file_path);
          
          if (!uploadResult.success) {
            console.error(`Failed to upload photo ${photo.id}:`, uploadResult.error);
            continue;
          }

          // Save metadata to Supabase database
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
          // Continue with other photos
        }
      }

      console.log('Photo sync completed');
    } catch (error) {
      console.error('Error in photo sync:', error);
      // Don't throw - continue with other sync operations
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

    // Fetch photos updated since last sync
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (photosError) throw photosError;

    if (photos && photos.length > 0) {
      console.log(`Pulled ${photos.length} updated photos metadata`);
      for (const photo of photos) {
        await offlineStorage.upsertPhoto({ ...photo, synced: true });
        
        // Optionally download photo blobs for offline viewing
        // This can be done in the background or on-demand
        try {
          const { data: blob, error: downloadError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (!downloadError && blob) {
            await offlineStorage.upsertPhotoBlob(photo.id, blob);
          }
        } catch (downloadError) {
          // Don't fail sync if photo download fails
          console.debug(`Failed to download photo ${photo.id}:`, downloadError);
        }
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

    // Fetch all photos metadata
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
      tempLotNumbersCount: 0, // TODO: Implement if needed
      lastSyncTime,
      isSyncing: this.isSyncing,
    };
  }
}

export default new SyncService();