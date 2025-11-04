// services/PhotoService.ts
import offlineStorage from './Offlinestorage';
import { supabase } from '../lib/supabase';

interface PhotoMetadata {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

class PhotoService {
  private dbReady: Promise<void>;

  constructor() {
    // Initialize database on service creation to prevent "object store not found" errors
    this.dbReady = offlineStorage.initialize().catch(error => {
      console.error('PhotoService: Failed to initialize database:', error);
      throw error;
    });
  }

  /**
   * Ensure database is ready before performing operations
   */
  private async ensureReady(): Promise<void> {
    await this.dbReady;
  }

  /**
   * Save photo blob to IndexedDB
   */
  async savePhotoBlob(photoId: string, blob: Blob): Promise<void> {
    await this.ensureReady();
    await offlineStorage.upsertPhotoBlob(photoId, blob);
  }

  /**
   * Get photo blob from IndexedDB
   */
  async getPhotoBlob(photoId: string): Promise<Blob | undefined> {
    await this.ensureReady();
    return await offlineStorage.getPhotoBlob(photoId);
  }

  /**
   * Save photo metadata to IndexedDB
   */
  async savePhotoMetadata(photo: PhotoMetadata): Promise<void> {
    await this.ensureReady();
    await offlineStorage.upsertPhoto({
      ...photo,
      synced: false, // Mark as unsynced initially
    });
  }

  /**
   * Get all photos for a lot from IndexedDB
   */
  async getPhotosByLot(lotId: string): Promise<any[]> {
    await this.ensureReady();
    return await offlineStorage.getPhotosByLot(lotId);
  }

  /**
   * Alias for getPhotosByLot - for backwards compatibility
   */
  async getPhotosForLot(lotId: string): Promise<any[]> {
    return this.getPhotosByLot(lotId);
  }

  /**
   * Save photo (metadata and blob) - high-level method
   */
  async savePhoto(
    photoId: string,
    lotId: string,
    blob: Blob,
    filePath: string,
    fileName: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureReady();

      // Save blob
      await this.savePhotoBlob(photoId, blob);

      // Save metadata
      const metadata: PhotoMetadata = {
        id: photoId,
        lot_id: lotId,
        file_path: filePath,
        file_name: fileName,
        is_primary: isPrimary,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await this.savePhotoMetadata(metadata);

      return { success: true };
    } catch (error) {
      console.error('Failed to save photo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save photo',
      };
    }
  }

  /**
   * Delete photo from IndexedDB
   */
  async deletePhoto(photoId: string): Promise<void> {
    await this.ensureReady();
    await offlineStorage.deletePhoto(photoId);
    await offlineStorage.deletePhotoBlob(photoId);
  }

  /**
   * Upload photo to Supabase Storage (when online)
   */
  async uploadToSupabase(
    blob: Blob,
    filePath: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { error } = await supabase.storage
        .from('photos')
        .upload(filePath, blob, {
          contentType: blob.type,
          upsert: true,
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return { success: false, error: error.message };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      return { success: true, url: urlData.publicUrl };
    } catch (error) {
      console.error('Upload exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Save photo metadata to Supabase database (when online)
   */
  async saveMetadataToSupabase(photo: PhotoMetadata): Promise<boolean> {
    try {
      const { error } = await supabase.from('photos').upsert(photo);

      if (error) {
        console.error('Failed to save photo metadata to Supabase:', error);
        return false;
      }

      // Mark as synced in IndexedDB
      await offlineStorage.upsertPhoto({ ...photo, synced: true });
      return true;
    } catch (error) {
      console.error('Save metadata exception:', error);
      return false;
    }
  }

  /**
   * Get object URL for displaying photo from blob
   */
  async getPhotoObjectUrl(photoId: string): Promise<string | null> {
    await this.ensureReady();
    const blob = await this.getPhotoBlob(photoId);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }

  /**
   * Convert data URL to Blob
   */
  dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Cleanup object URLs to prevent memory leaks
   */
  revokeObjectUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Set photo as primary
   */
  async setPrimaryPhoto(lotId: string, photoId: string): Promise<void> {
    await this.ensureReady();
    
    // Get all photos for the lot
    const photos = await this.getPhotosByLot(lotId);
    
    // Update all photos - set new primary and unset others
    for (const photo of photos) {
      const updatedPhoto = {
        ...photo,
        is_primary: photo.id === photoId,
        updated_at: new Date().toISOString(),
        synced: false, // Mark as needing sync
      };
      await offlineStorage.upsertPhoto(updatedPhoto);
    }
  }

  /**
   * Sync unsynced photos to Supabase
   */
  async syncPhotos(lotId?: string): Promise<{ success: number; failed: number }> {
    await this.ensureReady();
    
    let photos: any[];
    if (lotId) {
      photos = await this.getPhotosByLot(lotId);
      photos = photos.filter(p => !p.synced);
    } else {
      photos = await offlineStorage.getUnsyncedPhotos();
    }

    let success = 0;
    let failed = 0;

    for (const photo of photos) {
      try {
        // Get blob
        const blob = await this.getPhotoBlob(photo.id);
        if (!blob) {
          console.warn(`No blob found for photo ${photo.id}`);
          failed++;
          continue;
        }

        // Upload to Supabase
        const uploadResult = await this.uploadToSupabase(blob, photo.file_path);
        if (!uploadResult.success) {
          console.error(`Failed to upload photo ${photo.id}:`, uploadResult.error);
          failed++;
          continue;
        }

        // Save metadata to Supabase
        const metadataSaved = await this.saveMetadataToSupabase(photo);
        if (metadataSaved) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Error syncing photo ${photo.id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Download photos for a lot from Supabase to IndexedDB
   */
  async downloadPhotosForLot(lotId: string): Promise<{ success: number; failed: number }> {
    try {
      await this.ensureReady();

      // Get photo metadata from Supabase
      const { data: photos, error } = await supabase
        .from('photos')
        .select('*')
        .eq('lot_id', lotId);

      if (error) {
        console.error('Failed to fetch photos from Supabase:', error);
        return { success: 0, failed: 0 };
      }

      if (!photos || photos.length === 0) {
        return { success: 0, failed: 0 };
      }

      let success = 0;
      let failed = 0;

      for (const photo of photos) {
        try {
          // Download blob from Supabase Storage
          const { data: blob, error: downloadError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (downloadError || !blob) {
            console.error(`Failed to download photo ${photo.id}:`, downloadError);
            failed++;
            continue;
          }

          // Save to IndexedDB
          await this.savePhotoBlob(photo.id, blob);
          await offlineStorage.upsertPhoto({ ...photo, synced: true });
          success++;
        } catch (error) {
          console.error(`Error downloading photo ${photo.id}:`, error);
          failed++;
        }
      }

      return { success, failed };
    } catch (error) {
      console.error('Error in downloadPhotosForLot:', error);
      return { success: 0, failed: 0 };
    }
  }
}

export default new PhotoService();