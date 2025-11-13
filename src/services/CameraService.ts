// services/CameraService.ts
// Uses native device camera app
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import offlineStorage from './Offlinestorage';
import { supabase } from '../lib/supabase';
import ConnectivityService from './ConnectivityService';

// Simple UUID v4 generator
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
   * Open native camera app and capture photo
   * Automatically saves to device gallery
   */
  async takePhoto(lotId: string, isPrimary: boolean = false): Promise<CaptureResult> {
    try {
      console.log('📸 Opening native camera...');

      // Open native camera app
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: true, // Automatically saves to device gallery
      });

      if (!image.base64String) {
        return {
          success: false,
          error: 'No photo captured'
        };
      }

      // Convert to blob
      const blob = this.base64ToBlob(image.base64String, image.format);
      
      // Generate IDs
      const photoId = generateUUID();
      
      // Create blob URL for immediate display
      const blobUrl = URL.createObjectURL(blob);

      console.log('✅ Photo captured:', photoId);

      // BACKGROUND - Save to IndexedDB (non-blocking)
      this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });

      // BACKGROUND - Sync to Supabase if online (non-blocking)
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
      console.error('Failed to capture photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to capture photo'
      };
    }
  }

  /**
   * Pick photos from device gallery
   */
  async pickFromGallery(lotId: string): Promise<CaptureResult> {
    try {
      console.log('📷 Opening gallery...');

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos, // Open gallery picker
      });

      if (!image.base64String) {
        return {
          success: false,
          error: 'No photo selected'
        };
      }

      const blob = this.base64ToBlob(image.base64String, image.format);
      const photoId = generateUUID();
      const blobUrl = URL.createObjectURL(blob);

      console.log('✅ Photo selected:', photoId);

      this.savePhotoToIndexedDB(photoId, lotId, blob, false).catch(err => {
        console.error('Failed to save to IndexedDB:', err);
      });

      if (ConnectivityService.getConnectionStatus()) {
        this.syncPhotoToSupabase(photoId, lotId, blob, false).catch(err => {
          console.error('Failed to sync to Supabase:', err);
        });
      }

      return {
        success: true,
        photoId,
        blobUrl
      };
    } catch (error: any) {
      console.error('Failed to pick photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to pick photo'
      };
    }
  }

  /**
   * Convert base64 to blob
   */
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
   * Handle file input from web browser
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
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const photoId = generateUUID();
        const blobUrl = URL.createObjectURL(blob);

        result.photos.push({ photoId, blobUrl });
        result.success++;

        const isPrimary = i === 0;
        this.savePhotoToIndexedDB(photoId, lotId, blob, isPrimary).catch(err => {
          console.error('Failed to save file to IndexedDB:', err);
        });

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
   * Save photo to IndexedDB for offline access
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
   * Sync photo to Supabase storage and database
   */
  private async syncPhotoToSupabase(
    photoId: string,
    lotId: string,
    blob: Blob,
    isPrimary: boolean
  ): Promise<void> {
    try {
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