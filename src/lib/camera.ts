// lib/camera.ts
// Simple camera functions with device gallery saving enabled
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * Take a picture with device camera
 * MOBILE-FIRST: Photo is automatically saved to device photo gallery
 */
export async function takePicture() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: true  // CRITICAL: Save to device gallery
  });

  return image.webPath;
}

/**
 * Select a photo from device gallery
 */
export async function selectFromGallery() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos
  });

  return image.webPath;
}