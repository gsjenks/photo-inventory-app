// services/CameraService.ts
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
      allowEditing = true,
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
        alert('Unable to access camera. Please check permissions.');
      }
      return null;
    }
  }

  async captureMultiplePhotos(count: number = 5): Promise<CapacitorPhoto[]> {
    const photos: CapacitorPhoto[] = [];
    
    for (let i = 0; i < count; i++) {
      const shouldContinue = confirm(
        `Capture photo ${i + 1} of ${count}?\n(Cancel to finish early)`
      );
      
      if (!shouldContinue) break;
      
      const photo = await this.capturePhoto();
      if (photo) {
        photos.push(photo);
      } else {
        break;
      }
    }
    
    return photos;
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
            allowEditing: true,
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
          allowEditing: true,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos,
          correctOrientation: true,
        });
        
        return photo ? [photo] : [];
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app') {
        console.error('Gallery selection error:', error);
        alert('Unable to access photo gallery. Please check permissions.');
      }
      return [];
    }
  }

  /**
   * OPTIMIZED: Capture and save - returns immediately
   * Photo is saved to device gallery by camera
   * Then queued for background processing (IndexedDB + Supabase)
   */
  async captureAndSave(
    lotId: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; photoId?: string; error?: string }> {
    try {
      const photo = await this.capturePhoto({
        quality: 90,
        allowEditing: true,
        saveToGallery: true,
      });

      if (!photo) {
        return { success: false, error: 'No photo captured' };
      }

      return await this.savePhotoFast(photo, lotId, isPrimary);
    } catch (error) {
      console.error('Error in captureAndSave:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture photo'
      };
    }
  }

  /**
   * FAST: Save photo using PhotoService's fast method
   */
  private async savePhotoFast(
    photo: CapacitorPhoto,
    lotId: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; photoId?: string; error?: string }> {
    try {
      const photoId = crypto.randomUUID();
      const timestamp = Date.now();
      const format = photo.format || 'jpeg';
      const fileName = `${lotId}_${timestamp}.${format}`;
      const filePath = `${lotId}/${fileName}`;

      // Use PhotoService's fast save method
      const result = await PhotoService.savePhotoFast(
        photoId,
        lotId,
        photo,
        filePath,
        fileName,
        isPrimary
      );

      if (result.success) {
        return { success: true, photoId };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error saving photo fast:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save photo'
      };
    }
  }

  /**
   * LEGACY: Slow synchronous save (for web fallback)
   */
  async savePhoto(
    photo: CapacitorPhoto,
    lotId: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; photoId?: string; error?: string }> {
    try {
      const blob = await this.photoToBlob(photo);
      const photoId = crypto.randomUUID();
      const timestamp = Date.now();
      const format = photo.format || 'jpeg';
      const fileName = `${lotId}_${timestamp}.${format}`;
      const filePath = `${lotId}/${fileName}`;

      const result = await PhotoService.savePhoto(
        photoId,
        lotId,
        blob,
        filePath,
        fileName,
        isPrimary
      );

      if (result.success) {
        return { success: true, photoId };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error saving photo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save photo'
      };
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
   * OPTIMIZED: Capture multiple photos with instant feedback
   */
  async captureMultipleAndSave(
    lotId: string,
    count: number = 5
  ): Promise<{ 
    success: number; 
    failed: number; 
    photoIds: string[];
    errors: string[];
  }> {
    const photoIds: string[] = [];
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < count; i++) {
      const shouldContinue = i === 0 || confirm(
        `${success} photo(s) saved. Capture another? (${i + 1} of ${count})`
      );
      
      if (!shouldContinue) break;
      
      const photo = await this.capturePhoto({
        quality: 90,
        allowEditing: true,
        saveToGallery: true,
      });
      
      if (!photo) {
        break;
      }

      const isPrimary = photoIds.length === 0;
      const result = await this.savePhotoFast(photo, lotId, isPrimary);
      
      if (result.success && result.photoId) {
        success++;
        photoIds.push(result.photoId);
      } else {
        failed++;
        errors.push(result.error || 'Unknown error');
      }
    }

    return { success, failed, photoIds, errors };
  }

  async selectMultipleAndSave(
    lotId: string
  ): Promise<{ 
    success: number; 
    failed: number; 
    photoIds: string[];
    errors: string[];
  }> {
    const photos = await this.selectFromGallery(true);
    
    if (photos.length === 0) {
      return { success: 0, failed: 0, photoIds: [], errors: [] };
    }

    const photoIds: string[] = [];
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < photos.length; i++) {
      const isPrimary = i === 0;
      const result = await this.savePhotoFast(photos[i], lotId, isPrimary);
      
      if (result.success && result.photoId) {
        success++;
        photoIds.push(result.photoId);
      } else {
        failed++;
        errors.push(result.error || 'Unknown error');
      }
    }

    return { success, failed, photoIds, errors };
  }

  async handleFileInput(files: FileList | null, lotId: string): Promise<{
    success: number;
    failed: number;
    photoIds: string[];
    errors: string[];
  }> {
    if (!files || files.length === 0) {
      return { success: 0, failed: 0, photoIds: [], errors: [] };
    }

    const photoIds: string[] = [];
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPrimary = i === 0;
      
      try {
        const photoId = crypto.randomUUID();
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${lotId}_${timestamp}.${fileExt}`;
        const filePath = `${lotId}/${fileName}`;

        const result = await PhotoService.savePhoto(
          photoId,
          lotId,
          file,
          filePath,
          fileName,
          isPrimary
        );

        if (result.success) {
          success++;
          photoIds.push(photoId);
        } else {
          failed++;
          errors.push(result.error || 'Unknown error');
        }
      } catch (error) {
        failed++;
        errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return { success, failed, photoIds, errors };
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