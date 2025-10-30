import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { enrichLotData } from '../lib/gemini';
import type { Lot, Photo } from '../types';
import { ArrowLeft, Save, Sparkles, Upload, Camera, X, Star } from 'lucide-react';

export default function LotDetail() {
  const { saleId, lotId } = useParams<{ saleId: string; lotId: string }>();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Partial<Lot>>({
    name: '',
    description: '',
    condition: '',
    category: '',
    style: '',
    origin: '',
    creator: '',
    materials: '',
    quantity: 1,
    estimate_low: undefined,
    estimate_high: undefined,
    starting_bid: undefined,
    reserve_price: undefined,
    buy_now_price: undefined,
    height: undefined,
    width: undefined,
    depth: undefined,
    weight: undefined,
    consignor: '',
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (lotId && lotId !== 'new') {
      loadLot();
      loadPhotos();
    } else if (lotId === 'new') {
      // Get next lot number for new lots
      getNextLotNumber();
    }
  }, [lotId]);

  // Cleanup camera stream when component unmounts or camera is closed
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const getNextLotNumber = async () => {
    if (!saleId) return;

    try {
      const { data, error } = await supabase
        .from('lots')
        .select('lot_number')
        .eq('sale_id', saleId)
        .order('lot_number', { ascending: false })
        .limit(1);

      if (error) throw error;

      const nextNumber = data && data.length > 0 && data[0].lot_number 
        ? data[0].lot_number + 1 
        : 1;

      setLot(prev => ({ ...prev, lot_number: nextNumber }));
    } catch (error) {
      console.error('Error fetching next lot number:', error);
      setLot(prev => ({ ...prev, lot_number: 1 }));
    }
  };

  const loadLot = async () => {
    if (!lotId || lotId === 'new') return;

    try {
      const { data, error } = await supabase
        .from('lots')
        .select('*')
        .eq('id', lotId)
        .single();

      if (error) throw error;
      setLot(data);
    } catch (error) {
      console.error('Error loading lot:', error);
      alert('Failed to load lot');
    }
  };

  const loadPhotos = async () => {
    if (!lotId || lotId === 'new') return;

    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('lot_id', lotId)
        .order('is_primary', { ascending: false })
        .order('created_at');

      if (error) throw error;
      setPhotos(data || []);

      // Load URLs for all photos
      if (data && data.length > 0) {
        const urls: Record<string, string> = {};
        for (const photo of data) {
          const { data: urlData } = await supabase.storage
            .from('photos')
            .createSignedUrl(photo.file_path, 3600); // 1 hour expiry
          
          if (urlData?.signedUrl) {
            urls[photo.id] = urlData.signedUrl;
          }
        }
        setPhotoUrls(urls);
      }
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (lotId === 'new') {
      alert('Please save the lot first before uploading photos');
      return;
    }

    setLoading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadPhotoFile(file);
      }
      await loadPhotos();
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadPhotoFile = async (file: File) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${lotId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
      .from('photos')
      .insert({
        lot_id: lotId,
        file_path: filePath,
        file_name: file.name,
        is_primary: photos.length === 0,
      });

    if (dbError) throw dbError;
  };

  const startCamera = async () => {
    if (lotId === 'new') {
      alert('Please save the lot first before taking photos');
      return;
    }

    // Stop any existing stream first
    stopCamera();

    setCameraLoading(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false,
      });

      streamRef.current = stream;
      setShowCamera(true);
      
      // Wait for modal to render, then attach stream
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          setCameraLoading(false);
        }
      }, 100);
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      setCameraLoading(false);
      setShowCamera(false);
      
      if (error.name === 'NotAllowedError') {
        alert('Camera access denied. Please allow camera permissions in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        alert('No camera found on this device.');
      } else if (error.name === 'NotReadableError') {
        alert('Camera is already in use by another application. Please close other apps using the camera and try again.');
      } else {
        alert('Could not access camera. Please try again or use the Upload button.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Camera track stopped');
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setCameraLoading(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !streamRef.current) {
      alert('Camera not ready. Please try again.');
      return;
    }

    // Check if video is actually playing
    if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      alert('Camera is loading. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    if (canvas.width === 0 || canvas.height === 0) {
      alert('Camera not ready. Please wait for the preview to appear.');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          setLoading(true);
          try {
            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
            await uploadPhotoFile(file);
            await loadPhotos();
            alert('Photo captured successfully!');
            // Don't close camera automatically - let user take more photos
          } catch (error: any) {
            console.error('Error saving photo:', error);
            alert('Failed to save photo: ' + error.message);
          } finally {
            setLoading(false);
          }
        }
      }, 'image/jpeg', 0.95);
    }
  };

  const handleAIEnrich = async () => {
    if (photos.length === 0) {
      alert('Please upload at least one photo first');
      return;
    }

    setAiLoading(true);
    try {
      // Get photo URLs
      const photoUrls = await Promise.all(
        photos.slice(0, 3).map(async (photo) => {
          const { data } = await supabase.storage
            .from('photos')
            .createSignedUrl(photo.file_path, 60);
          return data?.signedUrl || '';
        })
      );

      const enrichedData = await enrichLotData(photoUrls, lot);
      
      setLot(prev => ({
        ...prev,
        ...enrichedData,
      }));

      alert('AI enrichment completed! Review the suggested data.');
    } catch (error) {
      console.error('AI enrichment error:', error);
      alert('AI enrichment failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!lot.name) {
      alert('Please enter a lot name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (lotId === 'new') {
        // Create new lot
        const { data, error } = await supabase
          .from('lots')
          .insert({
            sale_id: saleId,
            ...lot,
          })
          .select()
          .single();

        if (error) throw error;
        navigate(`/sales/${saleId}/lots/${data.id}`);
      } else {
        // Update existing lot
        const { error } = await supabase
          .from('lots')
          .update({
            ...lot,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lotId);

        if (error) throw error;
        alert('Lot saved successfully!');
      }
    } catch (error: any) {
      console.error('Error saving lot:', error);
      setError(error.message || 'Failed to save lot');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;

    try {
      await supabase.storage.from('photos').remove([photo.file_path]);
      await supabase.from('photos').delete().eq('id', photo.id);
      await loadPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  const handleSetPrimary = async (photo: Photo) => {
    try {
      // Unset all primary photos
      await supabase
        .from('photos')
        .update({ is_primary: false })
        .eq('lot_id', lotId);

      // Set this photo as primary
      await supabase
        .from('photos')
        .update({ is_primary: true })
        .eq('id', photo.id);

      await loadPhotos();
    } catch (error) {
      console.error('Error setting primary photo:', error);
      alert('Failed to set primary photo');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(`/sales/${saleId}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sale
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {lotId === 'new' ? 'New Item' : 'Edit Item'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Photos Section */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
              <div className="flex gap-2">
                {/* Camera Button - Opens camera interface */}
                <button
                  onClick={startCamera}
                  disabled={loading || lotId === 'new'}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <Camera className="w-4 h-4" />
                  Camera
                </button>
                
                {/* Upload Button - Opens file picker */}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    disabled={loading || lotId === 'new'}
                  />
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    <Upload className="w-4 h-4" />
                    Upload
                  </div>
                </label>
              </div>
            </div>

            {/* Camera Modal */}
            {showCamera && (
              <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg max-w-2xl w-full p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Take Photo</h3>
                    <button
                      onClick={stopCamera}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      aria-label="Close camera"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ minHeight: '400px' }}>
                    {cameraLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                          <p className="text-white">Starting camera...</p>
                        </div>
                      </div>
                    )}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full rounded-lg"
                      style={{ display: cameraLoading ? 'none' : 'block' }}
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={capturePhoto}
                      disabled={loading || cameraLoading}
                      className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? 'Saving...' : 'Capture Photo'}
                    </button>
                    <button
                      onClick={stopCamera}
                      className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {lotId === 'new' && (
              <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm border border-yellow-200">
                Save the item first to add photos
              </div>
            )}

            {photos.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Camera className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No photos yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      {photoUrls[photo.id] ? (
                        <img
                          src={photoUrls[photo.id]}
                          alt={photo.file_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
                        </div>
                      )}
                    </div>
                    {photo.is_primary && (
                      <div className="absolute top-2 left-2 bg-yellow-400 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                        <Star className="w-3 h-3 fill-white" />
                        Primary
                      </div>
                    )}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      {!photo.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(photo)}
                          className="p-1.5 bg-white rounded-full shadow hover:bg-yellow-50"
                          title="Set as primary"
                        >
                          <Star className="w-4 h-4 text-gray-600" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePhoto(photo)}
                        className="p-1.5 bg-white rounded-full shadow hover:bg-red-50"
                        title="Delete photo"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {photos.length > 0 && (
              <button
                onClick={handleAIEnrich}
                disabled={aiLoading}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                {aiLoading ? 'Enriching...' : 'AI Enrich'}
              </button>
            )}
          </div>
        </div>

        {/* Form Section */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item Name *
                    </label>
                    <input
                      type="text"
                      value={lot.name}
                      onChange={(e) => setLot({ ...lot, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Item name"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={lot.description}
                      onChange={(e) => setLot({ ...lot, description: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Detailed description and condition report"
                    />
                  </div>

                  <div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Lot Number
  </label>
  <input
    type="number"
    value={lot.lot_number || ''}
    readOnly
    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
    placeholder="Auto-generated"
  />
</div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={lot.quantity || 1}
                      onChange={(e) => setLot({ ...lot, quantity: parseInt(e.target.value) || 1 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condition
                    </label>
                    <input
                      type="text"
                      value={lot.condition || ''}
                      onChange={(e) => setLot({ ...lot, condition: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Excellent, Good, Fair, Poor"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={lot.category || ''}
                      onChange={(e) => setLot({ ...lot, category: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estimate Low ($)
                    </label>
                    <input
                      type="number"
                      value={lot.estimate_low || ''}
                      onChange={(e) => setLot({ ...lot, estimate_low: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estimate High ($)
                    </label>
                    <input
                      type="number"
                      value={lot.estimate_high || ''}
                      onChange={(e) => setLot({ ...lot, estimate_high: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Starting Bid ($)
                    </label>
                    <input
                      type="number"
                      value={lot.starting_bid || ''}
                      onChange={(e) => setLot({ ...lot, starting_bid: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reserve Price ($)
                    </label>
                    <input
                      type="number"
                      value={lot.reserve_price || ''}
                      onChange={(e) => setLot({ ...lot, reserve_price: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Dimensions */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Dimensions</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Height
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={lot.height || ''}
                      onChange={(e) => setLot({ ...lot, height: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Width
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={lot.width || ''}
                      onChange={(e) => setLot({ ...lot, width: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Depth
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={lot.depth || ''}
                      onChange={(e) => setLot({ ...lot, depth: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weight
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={lot.weight || ''}
                      onChange={(e) => setLot({ ...lot, weight: parseFloat(e.target.value) || undefined })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Provenance */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Provenance & Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Style/Period
                    </label>
                    <input
                      type="text"
                      value={lot.style || ''}
                      onChange={(e) => setLot({ ...lot, style: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Origin
                    </label>
                    <input
                      type="text"
                      value={lot.origin || ''}
                      onChange={(e) => setLot({ ...lot, origin: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Creator/Maker
                    </label>
                    <input
                      type="text"
                      value={lot.creator || ''}
                      onChange={(e) => setLot({ ...lot, creator: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Materials
                    </label>
                    <input
                      type="text"
                      value={lot.materials || ''}
                      onChange={(e) => setLot({ ...lot, materials: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Consignor
                    </label>
                    <input
                      type="text"
                      value={lot.consignor || ''}
                      onChange={(e) => setLot({ ...lot, consignor: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => navigate(`/sales/${saleId}`)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}