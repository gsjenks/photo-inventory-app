// services/CameraService.ts
// MOBILE-FIRST: Instant feedback, background processing
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { Photo as CapacitorPhoto } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import PhotoService from './PhotoService';

interface CameraOptions {
  quality?: number;
  allowEditing?: boolean;
  resultType?: CameraResultType;
  source?: CameraSource;
  correctOrientation?: boolean;
  width?: number;
  height?: number;
  saveToGallery?: boolean;
}

interface InstantPhotoResult {
  success: boolean;
  photoId?: string;
  blobUrl?: string;
  photo?: CapacitorPhoto;
  error?: string;
}

class CameraService {
  isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
  }

  async hasCamera(): Promise<boolean> {
    if (this.isNativePlatform()) {
      return true;
    }

    if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'videoinput');
      } catch {
        return false;
      }
    }
    return false;
  }

  async capturePhoto(options: CameraOptions = {}): Promise<CapacitorPhoto | null> {
    const {
      quality = 90,
      allowEditing = false,
      resultType = CameraResultType.Uri,
      correctOrientation = true,
      saveToGallery = true,
      width,
      height,
    } = options;

    try {
      const photo = await Camera.getPhoto({
        quality,
        allowEditing,
        resultType,
        source: CameraSource.Camera,
        correctOrientation,
        saveToGallery,
        width,
        height,
      });

      return photo;
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app') {
        console.error('Camera capture error:', error);
      }
      return null;
    }
  }

  /**
   * INSTANT FEEDBACK: Capture and return immediately with blob URL
   * Background: Save to IndexedDB and Supabase
   */
  async captureAndSaveInstant(
    lotId: string,
    isPrimary: boolean = false
  ): Promise<InstantPhotoResult> {
    try {
      // STEP 1: Capture photo with native gallery save
      const photo = await this.capturePhoto({
        quality: 90,
        allowEditing: false,
        saveToGallery: true,
      });

      if (!photo) {
        return { success: false, error: 'No photo captured' };
      }

      // STEP 2: Create blob URL immediately for instant UI display
      const blob = await this.photoToBlob(photo);
      const blobUrl = URL.createObjectURL(blob);
      const photoId = crypto.randomUUID();

      // STEP 3: Return immediately - UI can display photo now
      const result: InstantPhotoResult = {
        success: true,
        photoId,
        blobUrl,
        photo,
      };

      // STEP 4: Background processing - Save to IndexedDB and Supabase
      this.savePhotoBackground(photoId, lotId, blob, photo, isPrimary);

      return result;
    } catch (error) {
      console.error('Error in captureAndSaveInstant:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture photo'
      };
    }
  }

  /**
   * Background photo save - Non-blocking
   */
  private async savePhotoBackground(
    photoId: string,
    lotId: string,
    blob: Blob,
    photo: CapacitorPhoto,
    isPrimary: boolean
  ): Promise<void> {
    const timestamp = Date.now();
    const format = photo.format || 'jpeg';
    const fileName = `${lotId}_${timestamp}.${format}`;
    const filePath = `${lotId}/${fileName}`;

    // Save to IndexedDB (fast)
    setTimeout(async () => {
      try {
        await PhotoService.savePhoto(
          photoId,
          lotId,
          blob,
          filePath,
          fileName,
          isPrimary
        );
        console.log('✅ Photo saved to IndexedDB');
      } catch (error) {
        console.error('❌ IndexedDB save failed:', error);
      }
    }, 100);

    // Upload to Supabase if online (slower, background)
    if (navigator.onLine) {
      setTimeout(async () => {
        try {
          const uploadResult = await PhotoService.uploadToSupabase(blob, filePath);
          if (uploadResult.success) {
            await PhotoService.saveMetadataToSupabase({
              id: photoId,
              lot_id: lotId,
              file_path: filePath,
              file_name: fileName,
              is_primary: isPrimary,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            console.log('✅ Photo synced to Supabase');
          }
        } catch (error) {
          console.log('⏳ Supabase upload will retry later');
        }
      }, 2000);
    }
  }

  async photoToBlob(photo: CapacitorPhoto): Promise<Blob> {
    if (photo.base64String) {
      return this.base64ToBlob(photo.base64String, photo.format || 'jpeg');
    }
    
    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      return await response.blob();
    }
    
    if (photo.path) {
      throw new Error('Cannot convert file path to blob without Filesystem plugin');
    }
    
    throw new Error('No valid photo data found');
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
   * INSTANT: Capture multiple photos with immediate feedback
   */
  async captureMultipleInstant(
    lotId: string,
    count: number = 5
  ): Promise<{
    photos: Array<{ photoId: string; blobUrl: string }>;
    success: number;
    cancelled: boolean;
  }> {
    const photos: Array<{ photoId: string; blobUrl: string }> = [];
    let success = 0;

    for (let i = 0; i < count; i++) {
      const shouldContinue = i === 0 || confirm(
        `${success} photo(s) captured. Take another? (${i + 1} of ${count})`
      );
      
      if (!shouldContinue) {
        return { photos, success, cancelled: true };
      }
      
      const result = await this.captureAndSaveInstant(
        lotId,
        photos.length === 0
      );
      
      if (result.success && result.photoId && result.blobUrl) {
        photos.push({ photoId: result.photoId, blobUrl: result.blobUrl });
        success++;
      } else {
        break;
      }
    }

    return { photos, success, cancelled: false };
  }

  async selectFromGallery(multiple: boolean = false): Promise<CapacitorPhoto[]> {
    try {
      if (multiple && this.isNativePlatform()) {
        const photos: CapacitorPhoto[] = [];
        
        while (true) {
          const shouldContinue = photos.length === 0 || confirm(
            `${photos.length} photo(s) selected. Add another?`
          );
          
          if (!shouldContinue) break;
          
          const photo = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Uri,
            source: CameraSource.Photos,
            correctOrientation: true,
          });
          
          if (photo) {
            photos.push(photo);
          } else {
            break;
          }
        }
        
        return photos;
      } else {
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos,
          correctOrientation: true,
        });
        
        return photo ? [photo] : [];
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app') {
        console.error('Gallery selection error:', error);
      }
      return [];
    }
  }

  /**
   * INSTANT: Select and save from gallery
   */
  async selectAndSaveInstant(
    lotId: string
  ): Promise<{
    photos: Array<{ photoId: string; blobUrl: string }>;
    success: number;
  }> {
    const capacitorPhotos = await this.selectFromGallery(true);
    
    if (capacitorPhotos.length === 0) {
      return { photos: [], success: 0 };
    }

    const photos: Array<{ photoId: string; blobUrl: string }> = [];

    for (let i = 0; i < capacitorPhotos.length; i++) {
      const photo = capacitorPhotos[i];
      const blob = await this.photoToBlob(photo);
      const blobUrl = URL.createObjectURL(blob);
      const photoId = crypto.randomUUID();
      const isPrimary = i === 0;

      photos.push({ photoId, blobUrl });

      // Save in background
      this.savePhotoBackground(photoId, lotId, blob, photo, isPrimary);
    }

    return { photos, success: photos.length };
  }

  async handleFileInput(files: FileList | null, lotId: string): Promise<{
    photos: Array<{ photoId: string; blobUrl: string }>;
    success: number;
  }> {
    if (!files || files.length === 0) {
      return { photos: [], success: 0 };
    }

    const photos: Array<{ photoId: string; blobUrl: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const blobUrl = URL.createObjectURL(file);
      const photoId = crypto.randomUUID();
      const isPrimary = i === 0;
      
      photos.push({ photoId, blobUrl });

      // Save in background
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${lotId}_${timestamp}.${fileExt}`;
      const filePath = `${lotId}/${fileName}`;

      setTimeout(async () => {
        try {
          await PhotoService.savePhoto(
            photoId,
            lotId,
            file,
            filePath,
            fileName,
            isPrimary
          );
          
          if (navigator.onLine) {
            setTimeout(async () => {
              const uploadResult = await PhotoService.uploadToSupabase(file, filePath);
              if (uploadResult.success) {
                await PhotoService.saveMetadataToSupabase({
                  id: photoId,
                  lot_id: lotId,
                  file_path: filePath,
                  file_name: fileName,
                  is_primary: isPrimary,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              }
            }, 2000);
          }
        } catch (error) {
          console.error('Background save failed:', error);
        }
      }, 100);
    }

    return { photos, success: photos.length };
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const permissions = await Camera.requestPermissions();
      return permissions.camera === 'granted';
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return false;
    }
  }

  async checkPermissions(): Promise<boolean> {
    try {
      const permissions = await Camera.checkPermissions();
      return permissions.camera === 'granted' || permissions.camera === 'limited';
    } catch (error) {
      console.error('Error checking camera permissions:', error);
      return false;
    }
  }
}

export default new CameraService();