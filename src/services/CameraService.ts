// services/CameraService.ts
import PhotoService from './PhotoService';

interface CameraOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

class CameraService {
  /**
   * Check if device has camera capabilities
   */
  async hasCamera(): Promise<boolean> {
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

  /**
   * Capture photo using device camera (Web API)
   */
  async capturePhoto(options: CameraOptions = {}): Promise<Blob | null> {
    const { quality = 0.9, maxWidth = 1920, maxHeight = 1920 } = options;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: maxWidth }, height: { ideal: maxHeight } },
        audio: false
      });

      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const overlay = this.createCameraOverlay(video, canvas, stream, quality, resolve, reject);
        
        document.body.appendChild(overlay);

        video.srcObject = stream;
        video.play();
      });
    } catch (error) {
      console.error('Camera access error:', error);
      alert('Unable to access camera. Please check permissions.');
      return null;
    }
  }

  /**
   * Create camera overlay UI
   */
  private createCameraOverlay(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    stream: MediaStream,
    quality: number,
    resolve: (blob: Blob | null) => void,
    _reject: (error: any) => void
  ): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: black;
      z-index: 9999;
      display: flex;
      flex-direction: column;
    `;

    video.style.cssText = `
      flex: 1;
      width: 100%;
      height: 100%;
      object-fit: cover;
    `;

    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.8);
      gap: 20px;
    `;

    const captureBtn = this.createButton('📷 Capture', '#4f46e5', () => {
      this.captureFrame(video, canvas, quality, (blob) => {
        this.cleanup(overlay, stream);
        resolve(blob);
      });
    });

    const cancelBtn = this.createButton('❌ Cancel', '#dc2626', () => {
      this.cleanup(overlay, stream);
      resolve(null);
    });

    controls.appendChild(cancelBtn);
    controls.appendChild(captureBtn);
    overlay.appendChild(video);
    overlay.appendChild(controls);

    return overlay;
  }

  /**
   * Create button element
   */
  private createButton(text: string, bgColor: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      flex: 1;
      max-width: 200px;
      padding: 16px 24px;
      font-size: 18px;
      font-weight: 600;
      color: white;
      background: ${bgColor};
      border: none;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    btn.onclick = onClick;
    return btn;
  }

  /**
   * Capture frame from video and convert to blob
   */
  private captureFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    quality: number,
    callback: (blob: Blob | null) => void
  ): void {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      callback(null);
      return;
    }

    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(
      (blob) => callback(blob),
      'image/jpeg',
      quality
    );
  }

  /**
   * Cleanup camera resources
   */
  private cleanup(overlay: HTMLDivElement, stream: MediaStream): void {
    stream.getTracks().forEach(track => track.stop());
    overlay.remove();
  }

  /**
   * Handle file input selection (fallback for devices without camera)
   */
  async selectFromFiles(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment' as any;

      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          resolve(file);
        } else {
          resolve(null);
        }
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  /**
   * High-level method to capture and save photo
   */
  async captureAndSave(
    lotId: string,
    isPrimary: boolean = false
  ): Promise<{ success: boolean; photoId?: string; error?: string }> {
    try {
      // Check if camera is available
      const hasCamera = await this.hasCamera();
      
      let blob: Blob | null;
      
      if (hasCamera) {
        blob = await this.capturePhoto();
      } else {
        blob = await this.selectFromFiles();
      }

      if (!blob) {
        return { success: false, error: 'No photo captured' };
      }

      // Generate photo ID and file path
      const photoId = crypto.randomUUID();
      const timestamp = Date.now();
      const fileName = `${lotId}_${timestamp}.jpg`;
      const filePath = `${lotId}/${fileName}`;

      // Save photo using PhotoService
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
      console.error('Error in captureAndSave:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture photo'
      };
    }
  }
}

export default new CameraService();