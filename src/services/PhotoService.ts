// services/PhotoService.ts
import offlineStorage from './Offlinestorage';
import { supabase } from '../lib/supabase';
import ConnectivityService from './ConnectivityService';

interface PhotoMetadata {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

interface PhotoQueueItem {
  photoId: string;
  lotId: string;
  photoData: any;
  filePath: string;
  fileName: string;
  isPrimary: boolean;
  timestamp: number;
}

class PhotoService {
  private dbReady: Promise<void>;
  private processingQueue: PhotoQueueItem[] = [];
  private isProcessing = false;

  constructor() {
    this.dbReady = offlineStorage.initialize().catch(error => {
      console.error('PhotoService: Failed to initialize database:', error);
      throw error;
    });
  }

  private async ensureReady(): Promise<void> {
    await this.dbReady;
  }

  async savePhotoBlob(photoId: string, blob: Blob): Promise<void> {
    await this.ensureReady();
    await offlineStorage.upsertPhotoBlob(photoId, blob);
  }

  async getPhotoBlob(photoId: string): Promise<Blob | undefined> {
    await this.ensureReady();
    return await offlineStorage.getPhotoBlob(photoId);
  }

  async savePhotoMetadata(photo: PhotoMetadata): Promise<void> {
    await this.ensureReady();
    await offlineStorage.upsertPhoto({
      ...photo,
      synced: false,
    });
  }

  async getPhotosByLot(lotId: string): Promise<any[]> {
    await this.ensureReady();
    return await offlineStorage.getPhotosByLot(lotId);
  }

  async getPhotosForLot(lotId: string): Promise<any[]> {
    return this.getPhotosByLot(lotId);
  }

  /**
   * FAST: Queue photo for background processing
   * Returns immediately without blocking
   */
  queuePhotoForProcessing(
    photoId: string,
    lotId: string,
    photoData: any,
    filePath: string,
    fileName: string,
    isPrimary: boolean = false
  ): void {
    this.processingQueue.push({
      photoId,
      lotId,
      photoData,
      filePath,
      fileName,
      isPrimary,
      timestamp: Date.now(),
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Background processor - runs async without blocking UI
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const item = this.processingQueue.shift();
      if (!item) continue;

      try {
        // Convert to blob
        const blob = await this.convertToBlob(item.photoData);

        // Save to IndexedDB
        await this.savePhotoBlob(item.photoId, blob);

        const metadata: PhotoMetadata = {
          id: item.photoId,
          lot_id: item.lotId,
          file_path: item.filePath,
          file_name: item.fileName,
          is_primary: item.isPrimary,
          created_at: new Date(item.timestamp).toISOString(),
          updated_at: new Date(item.timestamp).toISOString(),
        };

        await this.savePhotoMetadata(metadata);

        // If online, sync to Supabase in background
        if (ConnectivityService.getConnectionStatus()) {
          this.syncPhotoToSupabase(blob, item.filePath, metadata).catch(err => {
            console.log('Background sync will retry later:', err.message);
          });
        }
      } catch (error) {
        console.error('Error processing photo queue item:', error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Convert photo data to blob
   */
  private async convertToBlob(photoData: any): Promise<Blob> {
    // Base64
    if (photoData.base64String) {
      return this.base64ToBlob(photoData.base64String, photoData.format || 'jpeg');
    }
    
    // Web path (file:// or blob:)
    if (photoData.webPath) {
      const response = await fetch(photoData.webPath);
      return await response.blob();
    }

    // Already a Blob or File
    if (photoData instanceof Blob) {
      return photoData;
    }
    
    throw new Error('Cannot convert photo data to blob');
  }

  private base64ToBlob(base64: string, format: string): Blob {
    const byteString = atob(base64);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([arrayBuffer], { type: `image/${format}` });
  }

  /**
   * Background sync single photo to Supabase
   */
  private async syncPhotoToSupabase(
    blob: Blob,
    filePath: string,
    metadata: PhotoMetadata
  ): Promise<void> {
    const uploadResult = await this.uploadToSupabase(blob, filePath);
    if (!uploadResult.success) {
      throw new Error(uploadResult.error);
    }

    const saved = await this.saveMetadataToSupabase(metadata);
    if (!saved) {
      throw new Error('Failed to save metadata');
    }
  }

  /**
   * LEGACY: Synchronous save (kept for compatibility)
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
      await this.savePhotoBlob(photoId, blob);

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

  async deletePhoto(photoId: string): Promise<void> {
    await this.ensureReady();
    await offlineStorage.deletePhoto(photoId);
    await offlineStorage.deletePhotoBlob(photoId);
  }

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
        return { success: false, error: error.message };
      }

      const { data: urlData } = supabase.storage
        .from('photos')
        .getPublicUrl(filePath);

      return { success: true, url: urlData.publicUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  async saveMetadataToSupabase(photo: PhotoMetadata): Promise<boolean> {
    try {
      const { error } = await supabase.from('photos').upsert(photo);

      if (error) {
        return false;
      }

      await offlineStorage.upsertPhoto({ ...photo, synced: true });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getPhotoObjectUrl(photoId: string): Promise<string | null> {
    await this.ensureReady();
    const blob = await this.getPhotoBlob(photoId);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }

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

  revokeObjectUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  async setPrimaryPhoto(lotId: string, photoId: string): Promise<void> {
    await this.ensureReady();
    const photos = await this.getPhotosByLot(lotId);
    
    for (const photo of photos) {
      const updatedPhoto = {
        ...photo,
        is_primary: photo.id === photoId,
        updated_at: new Date().toISOString(),
        synced: false,
      };
      await offlineStorage.upsertPhoto(updatedPhoto);
    }
  }

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
        const blob = await this.getPhotoBlob(photo.id);
        if (!blob) {
          failed++;
          continue;
        }

        const uploadResult = await this.uploadToSupabase(blob, photo.file_path);
        if (!uploadResult.success) {
          failed++;
          continue;
        }

        const metadataSaved = await this.saveMetadataToSupabase(photo);
        if (metadataSaved) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
      }
    }

    return { success, failed };
  }

  async downloadPhotosForLot(lotId: string): Promise<{ success: number; failed: number }> {
    try {
      await this.ensureReady();

      const { data: photos, error } = await supabase
        .from('photos')
        .select('*')
        .eq('lot_id', lotId);

      if (error) {
        return { success: 0, failed: 0 };
      }

      if (!photos || photos.length === 0) {
        return { success: 0, failed: 0 };
      }

      let success = 0;
      let failed = 0;

      for (const photo of photos) {
        try {
          const { data: blob, error: downloadError } = await supabase.storage
            .from('photos')
            .download(photo.file_path);

          if (downloadError || !blob) {
            failed++;
            continue;
          }

          await this.savePhotoBlob(photo.id, blob);
          await offlineStorage.upsertPhoto({ ...photo, synced: true });
          success++;
        } catch (error) {
          failed++;
        }
      }

      return { success, failed };
    } catch (error) {
      return { success: 0, failed: 0 };
    }
  }
}

export default new PhotoService();