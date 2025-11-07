// services/CameraService.ts
// MOBILE-FIRST: Instant photo display with background sync to Supabase
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import offlineStorage from './Offlinestorage';
import { supabase } from '../lib/supabase';
import ConnectivityService from './ConnectivityService';

// Simple UUID v4 generator (no external dependencies)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface CaptureResult {
  success: boolean;
  photoId?: string;
  blobUrl?: string;
  error?: string;
}

interface FileUploadResult {
  success: number;
  failed: number;
  photos: Array<{
    photoId: string;
    blobUrl: string;
  }>;
}

class CameraService {
  /**
   * INSTANT: Capture photo with native camera, save to device gallery, display immediately
   * BACKGROUND: Sync to Supabase when online
   */
  async captureAndSaveInstant(lotId: string, isPrimary: boolean = false): Promise<CaptureResult> {
    try {
      // Step 1: INSTANT - Capture photo (automatically saves to device gallery)
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: true,  // ✅ CRITICAL: Saves to device photo gallery
        correctOrientation: true,
      });

      if (!image.webPath) {
        return { success: false, error: 'No image captured' };
      }

      // Step 2: INSTANT - Convert to blob for local storage
      const response = await fetch(image.webPath);
      const blob = await response.blob();
      
      // Step 3: INSTANT - Generate ID and create blob URL for immediate display
      const photoId = generateUUID();
      const blobUrl = URL.createObjectURL(blob);

      // Step 4: BACKGROUND - Save to IndexedDB (instant, non-blocking)
      this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });

      // Step 5: BACKGROUND - Sync to Supabase if online (non-blocking)
      if (ConnectivityService.getConnectionStatus()) {
        this.syncPhotoToSupabase(photoId, lotId, blob, isPrimary).catch(err => {
          console.error('Failed to sync to Supabase:', err);
        });
      }

      return {
        success: true,
        photoId,
        blobUrl
      };
    } catch (error: any) {
      console.error('Camera capture error:', error);
      return {
        success: false,
        error: error.message || 'Failed to capture photo'
      };
    }
  }

  /**
   * INSTANT: Handle file input from gallery/upload, display immediately
   * BACKGROUND: Sync to Supabase when online
   */
  async handleFileInput(files: FileList, lotId: string): Promise<FileUploadResult> {
    const result: FileUploadResult = {
      success: 0,
      failed: 0,
      photos: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Step 1: INSTANT - Create blob URL for immediate display
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const photoId = generateUUID();
        const blobUrl = URL.createObjectURL(blob);

        result.photos.push({ photoId, blobUrl });
        result.success++;

        // Step 2: BACKGROUND - Save to IndexedDB (non-blocking)
        const isPrimary = i === 0; // First photo is primary
        this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
          console.error('Failed to save file to IndexedDB:', err);
        });

        // Step 3: BACKGROUND - Sync to Supabase if online (non-blocking)
        if (ConnectivityService.getConnectionStatus()) {
          this.syncPhotoToSupabase(photoId, lotId, blob, isPrimary).catch(err => {
            console.error('Failed to sync file to Supabase:', err);
          });
        }
      } catch (error) {
        console.error('File processing error:', error);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * BACKGROUND: Save photo to IndexedDB for offline access
   */
  private async savePhotoToIndexedDB(
    photoId: string,
    lotId: string,
    blob: Blob,
    isPrimary: boolean
  ): Promise<void> {
    const photoMetadata = {
      id: photoId,
      lot_id: lotId,
      file_path: `${lotId}/${photoId}.jpg`,
      file_name: `Photo_${Date.now()}.jpg`,
      is_primary: isPrimary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced: false
    };

    await offlineStorage.savePhoto(photoMetadata, blob);
    console.log('✅ Photo saved to IndexedDB');
  }

  /**
   * BACKGROUND: Sync photo to Supabase storage and database
   */
  private async syncPhotoToSupabase(
    photoId: string,
    lotId: string,
    blob: Blob,
    isPrimary: boolean
  ): Promise<void> {
    try {
      // Upload to Supabase Storage
      const fileName = `${lotId}/${photoId}.jpg`;
      const file = new File([blob], `${photoId}.jpg`, { type: blob.type });

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return;
      }

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('photos')
        .upsert({
          id: photoId,
          lot_id: lotId,
          file_path: fileName,
          file_name: `Photo_${Date.now()}.jpg`,
          is_primary: isPrimary,
        }, {
          onConflict: 'id'
        });

      if (dbError) {
        console.error('Supabase database error:', dbError);
        return;
      }

      // Mark as synced in IndexedDB
      const photo = await offlineStorage.getPhoto(photoId);
      if (photo) {
        photo.synced = true;
        await offlineStorage.updatePhoto(photo);
      }

      console.log('✅ Photo synced to Supabase');
    } catch (error) {
      console.error('Supabase sync error:', error);
    }
  }

  /**
   * Select photo from device gallery
   */
  async selectFromGallery(): Promise<string | null> {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos
      });

      return image.webPath || null;
    } catch (error) {
      console.error('Gallery selection error:', error);
      return null;
    }
  }

  /**
   * Sync all unsynced photos to Supabase
   */
  async syncUnsyncedPhotos(): Promise<void> {
    if (!ConnectivityService.getConnectionStatus()) {
      console.log('Cannot sync photos while offline');
      return;
    }

    try {
      const unsyncedPhotos = await offlineStorage.getUnsyncedPhotos();
      
      for (const photo of unsyncedPhotos) {
        const blob = await offlineStorage.getPhotoBlob(photo.id);
        if (blob) {
          await this.syncPhotoToSupabase(
            photo.id,
            photo.lot_id,
            blob,
            photo.is_primary
          );
        }
      }

      console.log(`✅ Synced ${unsyncedPhotos.length} photos to Supabase`);
    } catch (error) {
      console.error('Batch sync error:', error);
    }
  }
}

export default new CameraService();