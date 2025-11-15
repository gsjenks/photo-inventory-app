// src/components/LotDetail.tsx
// Lot detail editing with photos and AI enrichment

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFooter } from '../context/FooterContext';
import ConnectivityService from '../services/ConnectivityService';
import { getNextLotNumber, isTemporaryNumber } from '../services/LotNumberService';
import offlineStorage from '../services/Offlinestorage';
import CameraService from '../services/CameraService';
import type { Lot, Photo } from '../types';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Upload,
  Camera, 
  Sparkles,
  Star,
  Image as ImageIcon
} from 'lucide-react';

export default function LotDetail() {
  const { saleId, lotId } = useParams<{ saleId: string; lotId: string }>();
  const navigate = useNavigate();
  const { setActions, clearActions } = useFooter();
  const [isOnline, setIsOnline] = useState(ConnectivityService.getConnectionStatus());
  const [lot, setLot] = useState<Partial<Lot>>({
    name: '',
    description: '',
    quantity: 1,
    condition: '',
    category: '',
    style: '',
    origin: '',
    creator: '',
    materials: '',
    estimate_low: undefined,
    estimate_high: undefined,
    starting_bid: undefined,
    reserve_price: undefined,
    buy_now_price: undefined,
    height: undefined,
    width: undefined,
    depth: undefined,
    weight: undefined,
    dimension_unit: 'inches',
    consignor: ''
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isNewLot = lotId === 'new';

  // Monitor connectivity
  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange((online) => {
      setIsOnline(online);
      if (online) {
        console.log('Connection restored - photos will sync automatically');
      }
    });
    return unsubscribe;
  }, []);

  // Load lot data
  useEffect(() => {
    if (isNewLot) {
      initializeNewLot();
    } else {
      loadLot();
    }
  }, [lotId, saleId]);

  // Load photos
  useEffect(() => {
    if (!isNewLot && lotId) {
      loadPhotos();
    }
  }, [lotId, isNewLot]);

  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(photoUrls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [photoUrls]);

  // Set footer actions - UPDATED WITH PLATFORM DETECTION
  useEffect(() => {
    const platformCapabilities = CameraService.getPlatformCapabilities();
    
    setActions([
      // 1. SAVE (Always show)
      {
        id: 'save',
        label: isNewLot ? 'Create Item' : 'Save Changes',
        icon: <Save className="w-4 h-4" />,
        onClick: handleSave,
        variant: 'primary',
        disabled: !lot.name || saving,
        loading: saving
      },
      // 2. CAMERA (Mobile only - native camera with device controls)
      ...(platformCapabilities.supportsNativeCamera && !isNewLot ? [{
        id: 'camera',
        label: 'Camera',
        icon: <Camera className="w-4 h-4" />,
        onClick: handleTakePhoto,
        variant: 'secondary' as const,
        disabled: false
      }] : []),
      // 3. UPLOAD (Always show, label changes based on platform)
      ...(!isNewLot ? [{
        id: 'upload',
        label: platformCapabilities.isWeb ? 'Choose Files' : 'Upload',
        icon: <Upload className="w-4 h-4" />,
        onClick: () => document.getElementById('photo-upload')?.click(),
        variant: 'secondary' as const,
        disabled: false
      }] : []),
      // 4. BACK (Always show)
      {
        id: 'back',
        label: 'Back',
        icon: <ArrowLeft className="w-4 h-4" />,
        onClick: () => navigate(`/sales/${saleId}`),
        variant: 'secondary' as const
      },
      // 5. MAGIC/AI (Only when online and has photos)
      ...(photos.length > 0 && isOnline ? [{
        id: 'ai-enrich',
        label: 'Magic',
        icon: <Sparkles className="w-4 h-4" />,
        onClick: handleAIEnrich,
        variant: 'ai' as const,
        disabled: false
      }] : []),
      // 6. DELETE (Existing lots only)
      ...(!isNewLot ? [{
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: handleDelete,
        variant: 'danger' as const,
        disabled: false
      }] : [])
    ]);

    return () => clearActions();
  }, [lot, photos, isNewLot, saving, saleId, isOnline]);

  const initializeNewLot = async () => {
    try {
      const lotNumber = await getNextLotNumber(saleId!, isOnline);
      setLot(prev => ({
        ...prev,
        lot_number: lotNumber,
        sale_id: saleId
      }));
    } catch (error) {
      console.error('Error initializing new lot:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLot = async () => {
    if (!lotId) return;

    setLoading(true);
    try {
      // Try to load from Supabase first if online
      if (isOnline) {
        const { data, error } = await supabase
          .from('lots')
          .select('*')
          .eq('id', lotId)
          .single();

        if (error) throw error;
        if (data) {
          setLot(data);
          // Also cache locally
          await offlineStorage.upsertLot(data);
        }
      } else {
        // Load from offline storage
        const offlineLot = await offlineStorage.getLot(lotId);
        if (offlineLot) {
          setLot(offlineLot);
        }
      }
    } catch (error) {
      console.error('Error loading lot:', error);
      alert('Failed to load item');
    } finally {
      setLoading(false);
    }
  };

  const loadPhotos = async () => {
    if (!lotId) return;

    try {
      let photoData: Photo[] = [];
      const urls: Record<string, string> = {};

      // Try loading from IndexedDB first (for local/offline photos)
      const localPhotos = await offlineStorage.getPhotosByLot(lotId);
      if (localPhotos && localPhotos.length > 0) {
        photoData = localPhotos;
        
        // Create object URLs from blobs stored in IndexedDB
        for (const photo of localPhotos) {
          const blob = await offlineStorage.getPhotoBlob(photo.id);
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            urls[photo.id] = blobUrl;
          }
        }
      }

      // If online, also try loading from Supabase (for synced photos)
      if (isOnline) {
        const { data: remotePhotos, error } = await supabase
          .from('photos')
          .select('*')
          .eq('lot_id', lotId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (remotePhotos && remotePhotos.length > 0) {
          // Merge remote photos with local photos (avoid duplicates)
          const localPhotoIds = new Set(photoData.map(p => p.id));
          const newRemotePhotos = remotePhotos.filter(p => !localPhotoIds.has(p.id));
          photoData = [...photoData, ...newRemotePhotos];

          // Load URLs for remote photos
          for (const photo of remotePhotos) {
            if (!urls[photo.id]) {
              const { data: urlData } = await supabase.storage
                .from('photos')
                .createSignedUrl(photo.file_path, 3600);
              
              if (urlData) {
                urls[photo.id] = urlData.signedUrl;
              }
            }
          }
        }
      }

      setPhotos(photoData);
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  const handleTakePhoto = async () => {
    if (!lotId || isNewLot) {
      alert('Please save the lot first before adding photos');
      return;
    }

    try {
      const isPrimary = photos.length === 0;
      const result = await CameraService.takePhoto(lotId, isPrimary);
      
      if (!result.success) {
        alert(result.error || 'Failed to capture photo');
        return;
      }

      // CameraService handles everything - just update UI
      if (result.photoId && result.blobUrl) {
        const newPhoto: Photo = {
          id: result.photoId,
          lot_id: lotId,
          file_path: `${lotId}/${result.photoId}.jpg`,
          file_name: `Photo_${Date.now()}.jpg`,
          is_primary: isPrimary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false
        };

        setPhotos(prev => [...prev, newPhoto]);
        setPhotoUrls(prev => ({ ...prev, [result.photoId!]: result.blobUrl! }));
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      alert('Failed to capture photo');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!lotId || isNewLot) {
      alert('Please save the lot first before adding photos');
      e.target.value = '';
      return;
    }

    try {
      const result = await CameraService.handleFileInput(files, lotId);
      
      if (result.success > 0) {
        // Add photos to state
        const newPhotos = result.photos.map((p, index) => ({
          id: p.photoId,
          lot_id: lotId,
          file_path: `${lotId}/${p.photoId}.jpg`,
          file_name: `Photo_${Date.now()}_${index}.jpg`,
          is_primary: photos.length === 0 && index === 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          synced: false
        }));

        setPhotos(prev => [...prev, ...newPhotos]);

        const newUrls: Record<string, string> = {};
        result.photos.forEach(p => {
          newUrls[p.photoId] = p.blobUrl;
        });
        setPhotoUrls(prev => ({ ...prev, ...newUrls }));
      }

      if (result.failed > 0) {
        alert(`${result.failed} file(s) failed to upload`);
      }

      // Reset input
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos');
      e.target.value = '';
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    try {
      // Update all photos
      const updatedPhotos = photos.map(p => ({
        ...p,
        is_primary: p.id === photoId
      }));

      setPhotos(updatedPhotos);

      // Save to offline storage
      for (const photo of updatedPhotos) {
        await offlineStorage.upsertPhoto(photo);
      }

      // Update in Supabase if online
      if (isOnline) {
        // Clear all primary flags
        await supabase
          .from('photos')
          .update({ is_primary: false })
          .eq('lot_id', lotId);

        // Set new primary
        await supabase
          .from('photos')
          .update({ is_primary: true })
          .eq('id', photoId);
      }
    } catch (error) {
      console.error('Error setting primary photo:', error);
      alert('Failed to set primary photo');
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return;

    try {
      const photo = photos.find(p => p.id === photoId);
      if (!photo) return;

      // Delete from offline storage
      await offlineStorage.deletePhoto(photoId);

      // Delete from Supabase if online
      if (isOnline) {
        // Delete file from storage
        await supabase.storage
          .from('photos')
          .remove([photo.file_path]);

        // Delete database record
        await supabase
          .from('photos')
          .delete()
          .eq('id', photoId);
      }

      // Revoke object URL if exists
      const url = photoUrls[photoId];
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }

      // Update state
      setPhotos(prev => prev.filter(p => p.id !== photoId));
      setPhotoUrls(prev => {
        const updated = { ...prev };
        delete updated[photoId];
        return updated;
      });
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  const handleAIEnrich = async () => {
    if (!isOnline) {
      alert('AI enrichment requires an internet connection');
      return;
    }

    if (photos.length === 0) {
      alert('Please add photos first');
      return;
    }

    try {
      setSaving(true);

      // Get up to 3 photos for AI analysis
      const photosToAnalyze = photos.slice(0, 3);
      const photoDataUrls: string[] = [];

      // Convert photos to base64 data URLs
      for (const photo of photosToAnalyze) {
        const url = photoUrls[photo.id];
        if (url) {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            photoDataUrls.push(base64);
          } catch (error) {
            console.error('Error converting photo:', error);
          }
        }
      }

      if (photoDataUrls.length === 0) {
        throw new Error('No photos available for analysis');
      }

      // Call Gemini AI API
      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: `Analyze these auction/estate sale item photos and provide the following information in JSON format:
{
  "name": "Concise catalog title (max 100 chars)",
  "description": "Detailed description including condition, notable features, and any markings",
  "category": "Item category (e.g., Furniture, Art, Jewelry, Collectibles)",
  "style": "Style or period (e.g., Victorian, Modern, Art Deco)",
  "origin": "Country or region of origin if identifiable",
  "creator": "Maker or artist if identifiable (or 'Unknown')",
  "materials": "Primary materials used",
  "estimate_low": estimated low auction value in USD (number only),
  "estimate_high": estimated high auction value in USD (number only),
  "starting_bid": suggested starting bid in USD (number only),
  "height": approximate height in inches (number only),
  "width": approximate width in inches (number only),
  "depth": approximate depth in inches (number only),
  "condition": "Condition assessment (Excellent, Good, Fair, Poor)"
}

Provide only valid JSON, no additional text.`
                },
                ...photoDataUrls.map(dataUrl => ({
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: dataUrl.split(',')[1]
                  }
                }))
              ]
            }]
          })
        }
      );

      if (!response.ok) {
        throw new Error('AI enrichment failed');
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error('No response from AI');
      }

      // Parse JSON response
      const aiData = JSON.parse(textResponse);

      // Update lot with AI-generated data
      setLot(prev => ({
        ...prev,
        name: aiData.name || prev.name,
        description: aiData.description || prev.description,
        category: aiData.category || prev.category,
        style: aiData.style || prev.style,
        origin: aiData.origin || prev.origin,
        creator: aiData.creator || prev.creator,
        materials: aiData.materials || prev.materials,
        estimate_low: aiData.estimate_low || prev.estimate_low,
        estimate_high: aiData.estimate_high || prev.estimate_high,
        starting_bid: aiData.starting_bid || prev.starting_bid,
        height: aiData.height || prev.height,
        width: aiData.width || prev.width,
        depth: aiData.depth || prev.depth,
        condition: aiData.condition || prev.condition
      }));

      alert('AI enrichment complete! Review and adjust the suggested values.');
    } catch (error) {
      console.error('Error with AI enrichment:', error);
      alert('AI enrichment failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!lot.name) {
      alert('Please enter a name');
      return;
    }

    setSaving(true);
    try {
      const lotData = {
        ...lot,
        sale_id: saleId,
        updated_at: new Date().toISOString()
      };

      if (isNewLot) {
        // Create new lot
        if (isOnline) {
          const { data, error } = await supabase
            .from('lots')
            .insert(lotData)
            .select()
            .single();

          if (error) throw error;

          // Save to offline storage
          await offlineStorage.upsertLot(data);

          // Navigate to the new lot
          navigate(`/sales/${saleId}/lots/${data.id}`, { replace: true });
        } else {
          // Create offline with temporary ID
          const tempId = `temp_${Date.now()}`;
          const offlineLot = {
            ...lotData,
            id: tempId,
            created_at: new Date().toISOString()
          };

          await offlineStorage.upsertLot(offlineLot);
          navigate(`/sales/${saleId}/lots/${tempId}`, { replace: true });
        }
      } else {
        // Update existing lot
        if (isOnline) {
          const { error } = await supabase
            .from('lots')
            .update(lotData)
            .eq('id', lotId);

          if (error) throw error;
        }

        // Always save to offline storage
        await offlineStorage.upsertLot({ ...lotData, id: lotId } as Lot);

        alert('Lot saved successfully');
      }
    } catch (error) {
      console.error('Error saving lot:', error);
      alert('Failed to save lot');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this lot and all its photos?')) return;

    try {
      // Delete photos first
      for (const photo of photos) {
        await handleDeletePhoto(photo.id);
      }

      // Delete lot from Supabase if online
      if (isOnline) {
        const { error } = await supabase
          .from('lots')
          .delete()
          .eq('id', lotId);

        if (error) throw error;
      }

      // Delete from offline storage
      if (lotId) {
        const tx = await offlineStorage['db']!.transaction('lots', 'readwrite');
        await tx.objectStore('lots').delete(lotId);
        await tx.done;
      }

      // Navigate back
      navigate(`/sales/${saleId}`);
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete lot');
    }
  };

  const formatPrice = (value: number | undefined) => {
    return value !== undefined ? value : '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Hidden file input for photo upload */}
      <input
        id="photo-upload"
        type="file"
        accept="image/*"
        multiple
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Lot Number Badge */}
      <div className="mb-4">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
          Lot #{lot.lot_number || 'TBD'}
          {isTemporaryNumber(lot.lot_number) && (
            <span className="ml-2 text-xs text-indigo-600">(Temporary - will assign on sync)</span>
          )}
        </span>
      </div>

      {/* Photos Section */}
      {!isNewLot && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
            <span className="text-sm text-gray-500">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
          </div>

          {photos.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No photos yet</p>
              <p className="text-sm text-gray-400">
                {CameraService.getPlatformCapabilities().supportsNativeCamera 
                  ? 'Tap Camera button to take photos'
                  : 'Click Upload to add photos'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map(photo => (
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
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Primary Badge */}
                  {photo.is_primary && (
                    <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium">
                      Primary
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!photo.is_primary && (
                      <button
                        onClick={() => handleSetPrimary(photo.id)}
                        className="p-1.5 bg-white rounded-full shadow-md hover:bg-gray-50"
                        title="Set as primary"
                      >
                        <Star className="w-4 h-4 text-yellow-400" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="p-1.5 bg-white rounded-full shadow-md hover:bg-red-50"
                      title="Delete photo"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lot Details Form */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Item Details</h2>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item Name *
              </label>
              <input
                type="text"
                value={lot.name || ''}
                onChange={(e) => setLot({ ...lot, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="e.g., Victorian Oak Dining Table"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={lot.description || ''}
                onChange={(e) => setLot({ ...lot, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Detailed description of the item, including condition, notable features, and markings"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  value={lot.quantity || 1}
                  onChange={(e) => setLot({ ...lot, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  min="1"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <select
                  value={lot.condition || ''}
                  onChange={(e) => setLot({ ...lot, condition: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">Select condition</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={lot.category || ''}
                  onChange={(e) => setLot({ ...lot, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Furniture, Art, Jewelry"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Style/Period
                </label>
                <input
                  type="text"
                  value={lot.style || ''}
                  onChange={(e) => setLot({ ...lot, style: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Victorian, Modern, Art Deco"
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Low Estimate ($)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.estimate_low)}
                  onChange={(e) => setLot({ ...lot, estimate_low: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  High Estimate ($)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.estimate_high)}
                  onChange={(e) => setLot({ ...lot, estimate_high: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Starting Bid ($)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.starting_bid)}
                  onChange={(e) => setLot({ ...lot, starting_bid: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reserve Price ($)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.reserve_price)}
                  onChange={(e) => setLot({ ...lot, reserve_price: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="75"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buy Now Price ($)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.buy_now_price)}
                  onChange={(e) => setLot({ ...lot, buy_now_price: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="250"
                />
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-semibold text-gray-900">Dimensions & Weight</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Height (in)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.height)}
                  onChange={(e) => setLot({ ...lot, height: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="24"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Width (in)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.width)}
                  onChange={(e) => setLot({ ...lot, width: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="36"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Depth (in)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.depth)}
                  onChange={(e) => setLot({ ...lot, depth: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="18"
                  step="0.1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (lbs)
                </label>
                <input
                  type="number"
                  value={formatPrice(lot.weight)}
                  onChange={(e) => setLot({ ...lot, weight: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="50"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Provenance */}
          <div className="space-y-4 mt-6">
            <h2 className="text-lg font-semibold text-gray-900">Provenance</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origin
                </label>
                <input
                  type="text"
                  value={lot.origin || ''}
                  onChange={(e) => setLot({ ...lot, origin: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., France, England, USA"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., John Smith, Unknown"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Walnut, Oak, Bronze"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Consignor
                </label>
                <input
                  type="text"
                  value={lot.consignor || ''}
                  onChange={(e) => setLot({ ...lot, consignor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="Consignor name or reference"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}