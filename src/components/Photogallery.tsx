import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Photo } from '../types';
import { 
  Camera, 
  Upload, 
  Star, 
  Trash2, 
  Check, 
  Sparkles,
  X,
  Plus
} from 'lucide-react';

interface EnhancedPhotoGalleryProps {
  photos: Photo[];
  photoUrls: Record<string, string>;
  lotId: string;
  onPhotosChange: () => void;
  onNextLot?: () => void;
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

export default function EnhancedPhotoGallery({
  photos,
  photoUrls,
  lotId,
  onPhotosChange,
  onNextLot,
}: EnhancedPhotoGalleryProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setCameraStream(stream);
      setShowCameraModal(true);
      
      // Set video source after modal opens
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions or use the Upload button instead.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
  };

  // Capture photo from camera
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    const context = canvas.getContext('2d');
    if (!context) return;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert canvas to blob
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      // Create file from blob
      const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Upload the photo
      await uploadPhotos([file]);
      
      // Keep camera open for more photos
    }, 'image/jpeg', 0.9);
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

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await uploadPhotos(Array.from(files));
  };

  // Upload photos to Supabase
  const uploadPhotos = async (files: File[]) => {
    if (lotId === 'new') {
      alert('Please save the lot first before adding photos');
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        // Generate unique file name
        const fileExt = file.name.split('.').pop();
        const fileName = `${lotId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Check if this is the first photo (should be primary)
        const isPrimary = photos.length === 0;

        // Create photo record
        const { error: dbError } = await supabase
          .from('photos')
          .insert({
            lot_id: lotId,
            file_path: fileName,
            file_name: file.name,
            is_primary: isPrimary,
          });

        if (dbError) throw dbError;
      }

      onPhotosChange();
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
      // Delete from storage
      await supabase.storage.from('photos').remove([photo.file_path]);

      // Delete from database
      await supabase.from('photos').delete().eq('id', photo.id);

      // If this was the primary photo and there are other photos, make the first one primary
      if (photo.is_primary && photos.length > 1) {
        const nextPrimary = photos.find(p => p.id !== photo.id);
        if (nextPrimary) {
          await supabase
            .from('photos')
            .update({ is_primary: true })
            .eq('id', nextPrimary.id);
        }
      }

      onPhotosChange();
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  // Set primary photo
  const handleSetPrimary = async (photo: Photo) => {
    try {
      // Unset all primary flags
      await supabase
        .from('photos')
        .update({ is_primary: false })
        .eq('lot_id', lotId);

      // Set this photo as primary
      await supabase
        .from('photos')
        .update({ is_primary: true })
        .eq('id', photo.id);

      onPhotosChange();
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

  // Apply AI enhancements
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
      alert('Please select at least one enhancement option or enter a custom command');
      return;
    }

    setProcessing(true);
    try {
      // This is a placeholder for actual AI processing
      // In production, this would call Google Gemini API or similar service
      // to process images according to the prompt
      
      const mockPreviewImages: PreviewImage[] = photosToProcess.map(photo => ({
        originalPhotoId: photo.id,
        originalUrl: photoUrls[photo.id],
        enhancedUrl: photoUrls[photo.id], // In production, this would be the AI-enhanced image
      }));

      setPreviewImages(mockPreviewImages);
      setShowPreview(true);

      // TODO: Implement actual AI image processing
      // const enhancedImages = await processImagesWithAI(photosToProcess, prompt);
      
    } catch (error) {
      console.error('Error processing images:', error);
      alert('Failed to process images with AI');
    } finally {
      setProcessing(false);
    }
  };

  // Accept enhanced images
  const handleAcceptEnhancements = async () => {
    setProcessing(true);
    try {
      // TODO: Replace original images with enhanced versions in Supabase Storage
      // For now, just close the preview
      setShowPreview(false);
      setPreviewImages([]);
      alert('Images enhanced successfully!');
      onPhotosChange();
    } catch (error) {
      console.error('Error saving enhanced images:', error);
      alert('Failed to save enhanced images');
    } finally {
      setProcessing(false);
    }
  };

  // Reject enhanced images
  const handleRejectEnhancements = () => {
    setShowPreview(false);
    setPreviewImages([]);
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Camera Button - Opens native camera interface */}
        <button
          onClick={startCamera}
          disabled={uploading || lotId === 'new'}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
          title="Take photo with device camera"
        >
          <Camera className="w-4 h-4" />
          Camera
        </button>

        {/* Upload Button - For selecting existing photos from gallery */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || lotId === 'new'}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
          title="Select photos from gallery"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Next Lot Button */}
        {onNextLot && (
          <button
            onClick={onNextLot}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            title="Save and create next lot"
          >
            <Plus className="w-4 h-4" />
            Next Lot
          </button>
        )}

        {uploading && (
          <span className="text-sm text-gray-600">Uploading...</span>
        )}
      </div>

      {/* Enhancement Options Panel */}
      {photos.length > 0 && (
        <div className="bg-indigo-50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">AI Image Enhancements</h3>
            <button
              onClick={handleApplyAIEnhancements}
              disabled={processing || selectedPhotos.size === 0 && !enhancementOptions.applyToAll}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {processing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {processing ? 'Processing...' : 'Apply AI Image'}
            </button>
          </div>

          {/* Select All Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="applyToAll"
              checked={enhancementOptions.applyToAll}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="applyToAll" className="text-sm font-medium text-gray-700">
              Apply to all images ({photos.length} total)
            </label>
          </div>

          {/* Background Color Options */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Background Color</label>
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
        <div className="text-center py-12 text-gray-500">
          <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm mb-2">No photos yet</p>
          <p className="text-xs text-gray-400">
            Use the Camera or Upload button to add photos
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
                  <div className="absolute inset-0 bg-indigo-600 bg-opacity-20 flex items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}

                {/* Primary Star - Top Left Corner */}
                <div className="absolute top-2 left-2">
                  {photo.is_primary ? (
                    <div
                      className="p-1.5 bg-white rounded-full shadow-sm cursor-default"
                      title="Primary image"
                    >
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetPrimary(photo);
                      }}
                      className="p-1.5 bg-white rounded-full hover:bg-yellow-50 transition-colors shadow-sm"
                      title="Set as primary"
                    >
                      <Star className="w-5 h-5 text-gray-400" />
                    </button>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="absolute top-2 right-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePhoto(photo);
                    }}
                    className="p-1.5 bg-white rounded-full hover:bg-red-50 transition-colors shadow-sm"
                    title="Delete photo"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Camera Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Camera</h2>
              <button
                onClick={stopCamera}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Close camera"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Camera Preview */}
            <div className="flex-1 bg-black flex items-center justify-center p-4">
              <div className="relative w-full max-w-2xl aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded-lg"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>

            {/* Camera Controls */}
            <div className="flex items-center justify-center gap-4 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={capturePhoto}
                disabled={uploading}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-lg text-lg font-medium"
              >
                <Camera className="w-5 h-5" />
                {uploading ? 'Saving...' : 'Capture Photo'}
              </button>
              <button
                onClick={stopCamera}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-full hover:bg-gray-100 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </div>
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
    </div>
  );
}