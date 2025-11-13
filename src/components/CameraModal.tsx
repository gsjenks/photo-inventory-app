// components/CameraModal.tsx
// Full-featured camera with flash and flip controls
import { useState, useEffect } from 'react';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { 
  X, 
  Zap, 
  ZapOff, 
  RefreshCw,
  Camera
} from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photoData: { base64String: string; format: string }) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [cameraPosition, setCameraPosition] = useState<'rear' | 'front'>('rear');
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      await CameraPreview.start({
        position: cameraPosition,
        parent: 'camera-preview-container',
        toBack: false,
        enableHighResolution: true,
        disableAudio: true,
        lockAndroidOrientation: true,
        storeToFile: false,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      
      setIsCameraReady(true);
    } catch (error) {
      console.error('Failed to start camera:', error);
      alert('Failed to start camera');
      onClose();
    }
  };

  const stopCamera = async () => {
    try {
      await CameraPreview.stop();
      setIsCameraReady(false);
    } catch (error) {
      console.error('Failed to stop camera:', error);
    }
  };

  const handleCapture = async () => {
    try {
      const result = await CameraPreview.capture({
        quality: 90,
      });

      // Stop camera first
      await stopCamera();

      // Return photo data
      onCapture({
        base64String: result.value,
        format: 'jpeg',
      });

      onClose();
    } catch (error) {
      console.error('Failed to capture photo:', error);
      alert('Failed to capture photo');
    }
  };

  const toggleFlash = async () => {
    const modes: Array<'off' | 'on' | 'auto'> = ['off', 'on', 'auto'];
    const currentIndex = modes.indexOf(flashMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    
    try {
      await CameraPreview.setFlashMode({ flashMode: nextMode });
      setFlashMode(nextMode);
    } catch (error) {
      console.error('Failed to set flash mode:', error);
    }
  };

  const switchCamera = async () => {
    const newPosition = cameraPosition === 'rear' ? 'front' : 'rear';
    
    try {
      await CameraPreview.flip();
      setCameraPosition(newPosition);
    } catch (error) {
      console.error('Failed to flip camera:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Camera Preview Container */}
      <div 
        id="camera-preview-container"
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Top Controls Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex items-center justify-between">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Flash Toggle */}
          <button
            onClick={toggleFlash}
            className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            {flashMode === 'off' && <ZapOff className="w-6 h-6" />}
            {flashMode === 'on' && <Zap className="w-6 h-6 text-yellow-400" />}
            {flashMode === 'auto' && <Zap className="w-6 h-6 text-blue-400" />}
          </button>

          {/* Camera Flip */}
          <button
            onClick={switchCamera}
            className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <RefreshCw className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Focus Indicator */}
      <div className="absolute inset-0 z-5 pointer-events-none flex items-center justify-center">
        <div className="text-white text-sm bg-black/30 px-4 py-2 rounded-full">
          Tap to focus
        </div>
      </div>

      {/* Bottom Capture Button */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-8">
        <div className="flex items-center justify-center">
          <button
            onClick={handleCapture}
            disabled={!isCameraReady}
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 hover:bg-gray-100 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <Camera className="w-8 h-8 text-gray-800" />
          </button>
        </div>
        
        {/* Instructions */}
        <div className="text-center mt-4 text-white text-sm">
          <p>Tap to focus · {cameraPosition === 'rear' ? 'Rear' : 'Front'} camera</p>
          <p className="text-xs text-gray-300 mt-1">Photo will be saved to your device gallery</p>
        </div>
      </div>
    </div>
  );
}