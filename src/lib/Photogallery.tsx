// components/PhotoGallery.tsx
// Photo Gallery with native camera support and offline-first architecture

import { useState, useEffect } from 'react';
import type { Photo } from '../types';
import CameraService from '../services/CameraService';
import PhotoService from '../services/PhotoService';
import ConnectivityService from '../services/ConnectivityService';
import { 
  Camera, 
  Upload, 
  Star, 
  Trash2, 
  Check, 
  Sparkles,
  X,
  WifiOff,
  Wifi
} from 'lucide-react';

interface PhotoGalleryProps {
  lotId: string;
  onPhotosChange: () => void;
}

interface AIEnhancementOptions {
  applyToAll: boolean;
  backgroundColor: 'none' | 'white' | 'black' | 'grey';
  straighten: boolean;
  brighten: boolean;
  customCommand: string;
}

interface PreviewImage {
  originalPhotoId: string;
  originalUrl: string;
  enhancedUrl: string;
}

export default function PhotoGallery({
  lotId,
  onPhotosChange,
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isOnline, setIsOnline] = useState(ConnectivityService.getConnectionStatus());
  const [enhancementOptions, setEnhancementOptions] = useState<AIEnhancementOptions>({
    applyToAll: false,
    backgroundColor: 'none',
    straighten: false,
    brighten: false,
    customCommand: '',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [processing, setProcessing] = useState(false);

  // Subscribe to connectivity changes
  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        // When coming online, sync photos
        syncPhotos();
      }
    });

    return () => unsubscribe();
  }, []);

  // Load photos on mount and when lotId changes
  useEffect(() => {
    loadPhotos();
  }, [lotId]);

  // Load photos from IndexedDB (offline-first)
  const loadPhotos = async () => {
    if (lotId === 'new') {
      setPhotos([]);
      setPhotoUrls({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const loadedPhotos = await PhotoService.getPhotosByLot(lotId);
      setPhotos(loadedPhotos);

      // Load photo URLs (blob URLs from IndexedDB)
      const urls: Record<string, string> = {};
      for (const photo of loadedPhotos) {
        const url = await PhotoService.getPhotoObjectUrl(photo.id);
        if (url) {
          urls[photo.id] = url;
        }
      }
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync photos to cloud when online
  const syncPhotos = async () => {
    if (!isOnline) return;

    try {
      const result = await PhotoService.syncPhotos(lotId);
      console.log(`Synced ${result.success} photos, ${result.failed} failed`);
    } catch (error) {
      console.error('Error syncing photos:', error);
    }
  };

  // Cleanup photo URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(photoUrls).forEach(url => {
        PhotoService.revokeObjectUrl(url);
      });
    };
  }, [photoUrls]);

  // Toggle photo selection
  const togglePhotoSelection = (photoId: string) => {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);
  };

  // Select all photos
  const toggleSelectAll = () => {
    if (enhancementOptions.applyToAll) {
      setSelectedPhotos(new Set());
      setEnhancementOptions({ ...enhancementOptions, applyToAll: false });
    } else {
      setSelectedPhotos(new Set(photos.map(p => p.id)));
      setEnhancementOptions({ ...enhancementOptions, applyToAll: true });
    }
  };

  // Handle camera capture (native on mobile, web fallback)
  const handleCameraCapture = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    setUploading(true);
    try {
      const isNative = CameraService.isNativePlatform();
      
      if (isNative) {
        // Native camera with all device features
        const result = await CameraService.captureAndSave(
          lotId,
          photos.length === 0 // First photo is primary
        );

        if (result.success) {
          await loadPhotos();
          onPhotosChange();
          
          // Sync to cloud if online
          if (isOnline) {
            await syncPhotos();
          }
        } else if (result.error) {
          alert(`Failed to capture photo: ${result.error}`);
        }
      } else {
        // Web fallback - open file input with camera
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.multiple = false;

        input.onchange = async (e: Event) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            const result = await CameraService.handleFileInput(files, lotId);
            if (result.success > 0) {
              await loadPhotos();
              onPhotosChange();
              if (isOnline) {
                await syncPhotos();
              }
            }
          }
        };

        input.click();
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      alert('Failed to capture photo');
    } finally {
      setUploading(false);
    }
  };

  // Handle multiple photo capture
  const handleMultipleCapture = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    setUploading(true);
    try {
      const result = await CameraService.captureMultipleAndSave(lotId, 10);
      
      if (result.success > 0) {
        alert(`Successfully captured ${result.success} photo(s)`);
        await loadPhotos();
        onPhotosChange();
        
        if (isOnline) {
          await syncPhotos();
        }
      }

      if (result.failed > 0) {
        console.error('Some photos failed:', result.errors);
      }
    } catch (error) {
      console.error('Error capturing photos:', error);
      alert('Failed to capture photos');
    } finally {
      setUploading(false);
    }
  };

  // Handle upload from gallery
  const handleGalleryUpload = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    setUploading(true);
    try {
      const isNative = CameraService.isNativePlatform();
      
      if (isNative) {
        // Native gallery picker
        const result = await CameraService.selectMultipleAndSave(lotId);
        
        if (result.success > 0) {
          alert(`Successfully uploaded ${result.success} photo(s)`);
          await loadPhotos();
          onPhotosChange();
          
          if (isOnline) {
            await syncPhotos();
          }
        }

        if (result.failed > 0) {
          console.error('Some photos failed:', result.errors);
        }
      } else {
        // Web fallback - file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;

        input.onchange = async (e: Event) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            const result = await CameraService.handleFileInput(files, lotId);
            if (result.success > 0) {
              alert(`Successfully uploaded ${result.success} photo(s)`);
              await loadPhotos();
              onPhotosChange();
              if (isOnline) {
                await syncPhotos();
              }
            }
            if (result.failed > 0) {
              alert(`${result.failed} photo(s) failed to upload`);
            }
          }
        };

        input.click();
      }
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  // Delete photo
  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;

    try {
      await PhotoService.deletePhoto(photo.id);

      // If this was the primary photo and there are other photos, make the first one primary
      if (photo.is_primary && photos.length > 1) {
        const nextPrimary = photos.find(p => p.id !== photo.id);
        if (nextPrimary) {
          await PhotoService.setPrimaryPhoto(lotId, nextPrimary.id);
        }
      }

      await loadPhotos();
      onPhotosChange();

      // Sync deletion to cloud if online
      if (isOnline) {
        await syncPhotos();
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  // Set primary photo
  const handleSetPrimary = async (photo: Photo) => {
    try {
      await PhotoService.setPrimaryPhoto(lotId, photo.id);
      await loadPhotos();
      onPhotosChange();

      if (isOnline) {
        await syncPhotos();
      }
    } catch (error) {
      console.error('Error setting primary photo:', error);
      alert('Failed to set primary photo');
    }
  };

  // Build AI enhancement prompt
  const buildEnhancementPrompt = (): string => {
    const commands: string[] = [];

    if (enhancementOptions.backgroundColor !== 'none') {
      commands.push(`Remove the background and replace with ${enhancementOptions.backgroundColor} background`);
    }

    if (enhancementOptions.straighten) {
      commands.push('Straighten the image to correct any perspective distortion');
    }

    if (enhancementOptions.brighten) {
      commands.push('Brighten the image to improve visibility and clarity');
    }

    if (enhancementOptions.customCommand.trim()) {
      commands.push(enhancementOptions.customCommand.trim());
    }

    return commands.join('. ');
  };

  // Apply AI enhancements (placeholder for now)
  const handleApplyAIEnhancements = async () => {
    const photosToProcess = enhancementOptions.applyToAll 
      ? photos 
      : photos.filter(p => selectedPhotos.has(p.id));

    if (photosToProcess.length === 0) {
      alert('Please select at least one photo to enhance');
      return;
    }

    const prompt = buildEnhancementPrompt();
    if (!prompt) {
      alert('Please select at least one enhancement option');
      return;
    }

    if (!isOnline) {
      alert('AI enhancements require an internet connection. Your photos will be enhanced when you reconnect.');
      return;
    }

    setProcessing(true);
    try {
      // TODO: Implement actual AI enhancement with Gemini
      // For now, show a placeholder message
      alert(`AI Enhancement is not yet implemented.\n\nWould apply: ${prompt}\n\nTo ${photosToProcess.length} photo(s)`);
      
      // Preview would show original vs enhanced
      // setPreviewImages(previews);
      // setShowPreview(true);
    } catch (error) {
      console.error('Error applying AI enhancements:', error);
      alert('Failed to apply enhancements');
    } finally {
      setProcessing(false);
    }
  };

  // Accept AI enhancements
  const handleAcceptEnhancements = async () => {
    setProcessing(true);
    try {
      // TODO: Replace original photos with enhanced versions
      // Save to IndexedDB and sync to cloud
      
      setShowPreview(false);
      setPreviewImages([]);
      await loadPhotos();
      onPhotosChange();
    } catch (error) {
      console.error('Error accepting enhancements:', error);
      alert('Failed to save enhanced photos');
    } finally {
      setProcessing(false);
    }
  };

  // Reject AI enhancements
  const handleRejectEnhancements = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Action Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Photo Gallery</h3>
          {/* Connection Status Indicator */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
            isOnline 
              ? 'bg-green-100 text-green-700' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Camera Button - Single Photo */}
          <button
            onClick={handleCameraCapture}
            disabled={uploading || lotId === 'new'}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Camera className="w-4 h-4" />
            <span>Camera</span>
          </button>

          {/* Camera Button - Multiple Photos */}
          <button
            onClick={handleMultipleCapture}
            disabled={uploading || lotId === 'new'}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            title="Capture multiple photos"
          >
            <Camera className="w-4 h-4" />
            <span className="text-xs">Multi</span>
          </button>

          {/* Upload Button */}
          <button
            onClick={handleGalleryUpload}
            disabled={uploading || lotId === 'new'}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>

          {/* AI Enhancement Button */}
          {photos.length > 0 && (
            <button
              onClick={handleApplyAIEnhancements}
              disabled={processing || !isOnline}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:bg-indigo-50 disabled:cursor-not-allowed transition-colors"
              title={!isOnline ? 'Requires internet connection' : 'Apply AI enhancements'}
            >
              <Sparkles className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
              <span>AI Enhance</span>
            </button>
          )}
        </div>
      </div>

      {/* AI Enhancement Options */}
      {photos.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-indigo-900">AI Enhancement Options</h4>
            
            {/* Select All Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enhancementOptions.applyToAll}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-indigo-900">Apply to all images</span>
            </label>
          </div>

          {/* Background Color Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Background Color
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="backgroundColor"
                  value="none"
                  checked={enhancementOptions.backgroundColor === 'none'}
                  onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'none' })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">None</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="backgroundColor"
                  value="white"
                  checked={enhancementOptions.backgroundColor === 'white'}
                  onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'white' })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">White</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="backgroundColor"
                  value="black"
                  checked={enhancementOptions.backgroundColor === 'black'}
                  onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'black' })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Black</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="backgroundColor"
                  value="grey"
                  checked={enhancementOptions.backgroundColor === 'grey'}
                  onChange={() => setEnhancementOptions({ ...enhancementOptions, backgroundColor: 'grey' })}
                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Grey</span>
              </label>
            </div>
          </div>

          {/* Enhancement Checkboxes */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enhancementOptions.straighten}
                onChange={(e) => setEnhancementOptions({ ...enhancementOptions, straighten: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Straighten Image</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enhancementOptions.brighten}
                onChange={(e) => setEnhancementOptions({ ...enhancementOptions, brighten: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Brighten Image</span>
            </label>
          </div>

          {/* Custom Command Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Command (Optional)
            </label>
            <input
              type="text"
              value={enhancementOptions.customCommand}
              onChange={(e) => setEnhancementOptions({ ...enhancementOptions, customCommand: e.target.value })}
              placeholder="e.g., Isolate image, remove hand, enhance colors..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Selection Info */}
          {!enhancementOptions.applyToAll && selectedPhotos.size > 0 && (
            <p className="text-sm text-indigo-600">
              {selectedPhotos.size} image{selectedPhotos.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      )}

      {/* Photo Grid */}
      {photos.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm mb-2 font-medium">No photos yet</p>
          <p className="text-xs text-gray-400">
            {CameraService.isNativePlatform() 
              ? 'Use the Camera button to capture photos with your device'
              : 'Use the Camera or Upload button to add photos'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => {
            const isSelected = selectedPhotos.has(photo.id);
            const url = photoUrls[photo.id];

            return (
              <div
                key={photo.id}
                className={`relative group aspect-square rounded-lg overflow-hidden bg-gray-100 transition-all ${
                  isSelected 
                    ? 'ring-4 ring-indigo-500 shadow-lg' 
                    : 'hover:shadow-md'
                }`}
              >
                {/* Image */}
                {url ? (
                  <img
                    src={url}
                    alt={photo.file_name}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => togglePhotoSelection(photo.id)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                  </div>
                )}

                {/* Selection Overlay */}
                {isSelected && (
                  <div className="absolute inset-0 bg-indigo-600 bg-opacity-20 flex items-center justify-center">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}

                {/* Primary Badge */}
                {photo.is_primary && (
                  <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-sm">
                    Primary
                  </div>
                )}

                {/* Sync Status Badge */}
                {!photo.synced && (
                  <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded text-xs font-medium shadow-sm">
                    Pending Sync
                  </div>
                )}

                {/* Action Buttons */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!photo.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(photo)}
                      className="p-1.5 bg-white rounded-full hover:bg-yellow-50 transition-colors shadow-sm"
                      title="Set as primary"
                    >
                      <Star className="w-4 h-4 text-yellow-400" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeletePhoto(photo)}
                    className="p-1.5 bg-white rounded-full hover:bg-red-50 transition-colors shadow-sm"
                    title="Delete photo"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>

                {/* File Name */}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {photo.file_name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Preview Enhanced Images</h2>
              <button
                onClick={handleRejectEnhancements}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {previewImages.map((preview) => (
                  <div key={preview.originalPhotoId} className="space-y-2">
                    {/* Original */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Original</p>
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={preview.originalUrl}
                          alt="Original"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>

                    {/* Enhanced */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Enhanced</p>
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-indigo-500">
                        <img
                          src={preview.enhancedUrl}
                          alt="Enhanced"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={handleRejectEnhancements}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAcceptEnhancements}
                disabled={processing}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {processing ? 'Saving...' : 'Accept & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
            <p className="text-gray-700">Processing photos...</p>
          </div>
        </div>
      )}
    </div>
  );
}