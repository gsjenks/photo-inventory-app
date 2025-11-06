import { supabase } from '../lib/supabase';
import offlineStorage from './Offlinestorage';
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
   * PRIORITY SYNC: Active sales first (blocking with progress)
   * Step 1: Company data
   * Step 2: Active sales
   * Step 3: Active sales lots
   * Step 4: Active sales photos metadata
   * Background: Photo blobs, remaining data
   */
  async performInitialSync(companyId: string): Promise<void> {
    if (this.isSyncing) {
      console.log('⏸️ Sync already in progress');
      return;
    }

    this.isSyncing = true;
    
    try {
      console.log('🚀 PRIORITY SYNC: Active sales and company data...');
      this.notifyProgress('Initializing', 0, 4);

      // STEP 1: Company data (PRIORITY)
      this.notifyProgress('Syncing company data', 1, 4);
      await this.syncCompanyData(companyId);

      // STEP 2: Active sales (PRIORITY)
      this.notifyProgress('Syncing active sales', 2, 4);
      const activeSales = await this.syncActiveSales(companyId);

      // STEP 3: Active sales lots (PRIORITY)
      this.notifyProgress('Syncing items', 3, 4);
      await this.syncLotsForActiveSales(activeSales);

      // STEP 4: Active sales photos metadata (PRIORITY)
      this.notifyProgress('Syncing photos', 4, 4);
      await this.syncPhotosForActiveSales(activeSales);

      await offlineStorage.setLastSyncTime(Date.now());
      console.log('✅ Priority sync complete');
      this.notifyProgress('Complete', 4, 4);

      // BACKGROUND: Download photo blobs (non-blocking)
      this.downloadPhotoBlobsInBackground(activeSales);

      // BACKGROUND: Sync remaining data (non-blocking)
      this.syncRemainingDataInBackground(companyId);

      // BACKGROUND: Push any pending local changes (non-blocking)
      this.pushLocalChangesInBackground();

    } catch (error) {
      console.error('❌ Priority sync failed:', error);
      this.notifyProgress('Error', 0, 0);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * BACKGROUND: Sync remaining data (completed sales, contacts, documents)
   */
  private syncRemainingDataInBackground(companyId: string): void {
    setTimeout(async () => {
      try {
        console.log('📦 BACKGROUND SYNC: Remaining data...');

        // Completed sales
        await this.syncCompletedSales(companyId);

        // Contacts (company + sale level)
        await this.syncContacts(companyId);

        // Documents (company + sale level)
        await this.syncDocuments(companyId);

        // Lookup categories
        await this.syncLookupCategories(companyId);

        console.log('✅ Background sync complete');
      } catch (error) {
        console.error('❌ Background sync failed:', error);
      }
    }, 3000); // Start after 3 seconds
  }

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

  private async syncCompletedSales(companyId: string): Promise<void> {
    console.log('📦 Syncing completed sales...');
    
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .order('start_date', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`📦 Found ${data.length} completed sales`);
      for (const sale of data) {
        await offlineStorage.upsertSale(sale);
      }

      // Sync lots and photos for completed sales
      await this.syncLotsForSales(data);
      await this.syncPhotosForSales(data);
    }
  }

  private async syncContacts(companyId: string): Promise<void> {
    console.log('👥 Syncing contacts...');
    
    try {
      // Company-level contacts
      const { data: companyContacts, error: companyError } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', companyId)
        .is('sale_id', null);

      if (companyError) throw companyError;

      if (companyContacts && companyContacts.length > 0) {
        console.log(`👥 Found ${companyContacts.length} company contacts`);
        for (const contact of companyContacts) {
          await offlineStorage.upsertItem('contacts', contact);
        }
      }

      // Sale-level contacts (for all sales)
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId);

      if (sales && sales.length > 0) {
        const saleIds = sales.map(s => s.id);
        
        const { data: saleContacts, error: saleError } = await supabase
          .from('contacts')
          .select('*')
          .in('sale_id', saleIds);

        if (saleError) throw saleError;

        if (saleContacts && saleContacts.length > 0) {
          console.log(`👥 Found ${saleContacts.length} sale contacts`);
          for (const contact of saleContacts) {
            await offlineStorage.upsertItem('contacts', contact);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing contacts:', error);
    }
  }

  private async syncDocuments(companyId: string): Promise<void> {
    console.log('📄 Syncing documents...');
    
    try {
      // Company-level documents
      const { data: companyDocs, error: companyError } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', companyId)
        .is('sale_id', null);

      if (companyError) throw companyError;

      if (companyDocs && companyDocs.length > 0) {
        console.log(`📄 Found ${companyDocs.length} company documents`);
        for (const doc of companyDocs) {
          await offlineStorage.upsertItem('documents', doc);
        }
      }

      // Sale-level documents (for all sales)
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId);

      if (sales && sales.length > 0) {
        const saleIds = sales.map(s => s.id);
        
        const { data: saleDocs, error: saleError } = await supabase
          .from('documents')
          .select('*')
          .in('sale_id', saleIds);

        if (saleError) throw saleError;

        if (saleDocs && saleDocs.length > 0) {
          console.log(`📄 Found ${saleDocs.length} sale documents`);
          for (const doc of saleDocs) {
            await offlineStorage.upsertItem('documents', doc);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing documents:', error);
    }
  }

  private async syncLookupCategories(companyId: string): Promise<void> {
    console.log('🏷️ Syncing lookup categories...');
    
    try {
      const { data, error } = await supabase
        .from('lookup_categories')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;

      if (data && data.length > 0) {
        console.log(`🏷️ Found ${data.length} lookup categories`);
        for (const category of data) {
          await offlineStorage.upsertItem('lookup_categories', category);
        }
      }
    } catch (error) {
      console.error('Error syncing lookup categories:', error);
    }
  }

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

  private async syncLotsForSales(sales: any[]): Promise<void> {
    if (sales.length === 0) return;

    const saleIds = sales.map(s => s.id);
    
    const { data, error } = await supabase
      .from('lots')
      .select('*')
      .in('sale_id', saleIds);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log(`📋 Found ${data.length} items for sales`);
      for (const lot of data) {
        await offlineStorage.upsertLot(lot);
      }
    }
  }

  private async syncPhotosForActiveSales(activeSales: any[]): Promise<void> {
    if (activeSales.length === 0) return;

    const saleIds = activeSales.map(s => s.id);
    
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('id')
      .in('sale_id', saleIds);

    if (lotsError) throw lotsError;
    if (!lots || lots.length === 0) return;

    const lotIds = lots.map(l => l.id);

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

  private async syncPhotosForSales(sales: any[]): Promise<void> {
    if (sales.length === 0) return;

    const saleIds = sales.map(s => s.id);
    
    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('id')
      .in('sale_id', saleIds);

    if (lotsError) throw lotsError;
    if (!lots || lots.length === 0) return;

    const lotIds = lots.map(l => l.id);

    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .in('lot_id', lotIds);

    if (photosError) throw photosError;

    if (photos && photos.length > 0) {
      console.log(`🖼️  Found ${photos.length} photos`);
      for (const photo of photos) {
        await offlineStorage.upsertPhoto({ ...photo, synced: true });
      }
    }
  }

  /**
   * Download photo blobs in background (non-blocking)
   */
  private downloadPhotoBlobsInBackground(activeSales: any[]): void {
    setTimeout(async () => {
      try {
        if (activeSales.length === 0) return;

        const saleIds = activeSales.map(s => s.id);
        
        const { data: lots } = await supabase
          .from('lots')
          .select('id')
          .in('sale_id', saleIds);

        if (!lots) return;

        console.log('🖼️  Starting background photo download...');

        for (const lot of lots) {
          try {
            const result = await PhotoService.downloadPhotosForLot(lot.id);
            if (result.success > 0) {
              console.log(`✅ Downloaded ${result.success} photos for lot ${lot.id}`);
            }
          } catch (error) {
            console.debug('Photo download failed for lot', lot.id);
          }
        }

        console.log('🖼️  Background photo download complete');
      } catch (error) {
        console.debug('Background photo download error');
      }
    }, 2000);
  }

  /**
   * Push local changes in background (non-blocking)
   */
  private pushLocalChangesInBackground(): void {
    setTimeout(async () => {
      try {
        await this.pushLocalChanges();
      } catch (error) {
        console.debug('Background push failed:', error);
      }
    }, 1000);
  }

  async performFullSync(companyId: string): Promise<void> {
    if (this.isSyncing) {
      console.log('⏸️ Sync already in progress');
      return;
    }

    this.isSyncing = true;

    try {
      console.log('🔄 Starting full sync...');
      this.notifyProgress('Full sync in progress', 0, 4);

      await offlineStorage.clearAll();
      await this.pullAllData(companyId);
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
   * OPTIMIZED: Background sync - non-blocking
   */
  async performSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('⏸️ Sync already in progress');
      return;
    }

    this.isSyncing = true;
    
    try {
      console.log('🔄 Starting background sync...');

      // Push local changes
      await this.pushLocalChanges();

      // Sync photos (background queue handles this now)
      await this.syncPhotosBackground();

      // Replace temporary lot numbers
      await this.replaceTempLotNumbers();

      // Pull remote changes
      await this.pullRemoteChanges();

      console.log('✅ Background sync complete');
    } catch (error) {
      console.error('❌ Sync error:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushLocalChanges(): Promise<void> {
    console.log('📤 Pushing local changes to cloud...');
    
    const pendingItems = await offlineStorage.getPendingSyncItems();
    
    if (pendingItems.length === 0) {
      console.log('✓ No pending changes to push');
      return;
    }

    console.log(`📤 Found ${pendingItems.length} pending changes to push`);

    for (const item of pendingItems) {
      try {
        await this.syncItem(item.table, item.type, item.data);
        await offlineStorage.markSynced(item.id);
      } catch (error: any) {
        console.error(`Failed to sync ${item.table} ${item.type}:`, error.message);
      }
    }

    await offlineStorage.clearSyncedItems();
  }

  private async syncItem(table: string, type: 'create' | 'update' | 'delete', data: any): Promise<void> {
    // Special handling for photos
    if (table === 'photos') {
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
   * OPTIMIZED: Non-blocking photo sync
   * Uses PhotoService's background queue
   */
  private async syncPhotosBackground(): Promise<void> {
    console.log('🖼️  Syncing photos in background...');

    try {
      const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
      
      if (unsyncedPhotos.length === 0) {
        console.log('✓ No photos to sync');
        return;
      }

      console.log(`🖼️  Found ${unsyncedPhotos.length} photos to sync`);

      // Process in background - non-blocking
      setTimeout(async () => {
        for (const photo of unsyncedPhotos) {
          try {
            const blob = await offlineStorage.getPhotoBlob(photo.id);
            
            if (!blob) {
              console.warn(`No blob found for photo ${photo.id}`);
              continue;
            }

            const uploadResult = await PhotoService.uploadToSupabase(blob, photo.file_path);
            
            if (!uploadResult.success) {
              console.error(`Failed to upload photo ${photo.id}`);
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
              console.log(`✅ Synced photo ${photo.id}`);
            }
          } catch (error) {
            console.error(`Error syncing photo ${photo.id}`);
          }
        }

        console.log('🖼️  Background photo sync complete');
      }, 500);

    } catch (error) {
      console.error('Error in photo sync:', error);
    }
  }

  private async replaceTempLotNumbers(): Promise<void> {
    console.log('🔢 Replacing temporary lot numbers...');

    try {
      const { data: sales, error } = await supabase
        .from('sales')
        .select('id');

      if (error) throw error;

      if (!sales || sales.length === 0) {
        console.log('✓ No sales found');
        return;
      }

      for (const sale of sales) {
        await LotNumberService.reassignTemporaryNumbers(sale.id);
      }

      console.log('✅ Temporary lot numbers replaced successfully');
    } catch (error) {
      console.error('Error replacing temporary lot numbers:', error);
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    console.log('📥 Pulling remote changes from cloud...');
    
    const lastSyncTime = await offlineStorage.getLastSyncTime();
    
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')
      .gt('updated_at', new Date(lastSyncTime).toISOString());

    if (companiesError) throw companiesError;

    if (companies && companies.length > 0) {
      console.log(`📥 Pulled ${companies.length} updated companies`);
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
      console.log(`📥 Pulled ${sales.length} updated sales`);
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
      console.log(`📥 Pulled ${lots.length} updated lots`);
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
      console.log(`📥 Pulled ${photos.length} updated photos metadata`);
      
      // Download in background
      setTimeout(async () => {
        for (const photo of photos) {
          try {
            await offlineStorage.upsertPhoto({ ...photo, synced: true });
            
            const { data: blob, error: downloadError } = await supabase.storage
              .from('photos')
              .download(photo.file_path);

            if (!downloadError && blob) {
              await offlineStorage.upsertPhotoBlob(photo.id, blob);
            }
          } catch (error) {
            console.debug(`Failed to download photo ${photo.id}`);
          }
        }
      }, 1000);
    }

    await offlineStorage.setLastSyncTime(Date.now());
    console.log('✅ Remote changes pulled successfully');
  }

  private async pullAllData(companyId: string): Promise<void> {
    console.log('📥 Pulling all data from cloud...');

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError) throw companyError;
    if (company) {
      await offlineStorage.upsertCompany(company);
    }

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

    const { data: lots, error: lotsError } = await supabase
      .from('lots')
      .select('*');

    if (lotsError) throw lotsError;

    if (lots) {
      for (const lot of lots) {
        await offlineStorage.upsertLot(lot);
      }
    }

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