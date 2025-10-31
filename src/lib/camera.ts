// lib/camera.ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export async function takePicture() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera
  });

  return image.webPath;
}

export async function selectFromGallery() {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos
  });

  return image.webPath;
}