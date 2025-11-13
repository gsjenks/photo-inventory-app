import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFooter } from '../context/FooterContext';
import ConnectivityService from '../services/ConnectivityService';
import { getNextLotNumber, isTemporaryNumber } from '../services/LotNumberService';
import offlineStorage from '../services/Offlinestorage';
import CameraService from '../services/CameraService';
import CameraModal from './CameraModal';
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
  const [showCameraModal, setShowCameraModal] = useState(false);
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

  // Set footer actions
  useEffect(() => {
    setActions([
      // 1. SAVE
      {
        id: 'save',
        label: isNewLot ? 'Create Item' : 'Save Changes',
        icon: <Save className="w-4 h-4" />,
        onClick: handleSave,
        variant: 'primary',
        disabled: !lot.name || saving,
        loading: saving
      },
      // 2. CAMERA
      {
        id: 'camera',
        label: 'Camera',
        icon: <Camera className="w-4 h-4" />,
        onClick: handleCamera,
        variant: 'secondary',
        disabled: isNewLot
      },
      // 3. UPLOAD
      {
        id: 'upload',
        label: 'Upload',
        icon: <Upload className="w-4 h-4" />,
        onClick: () => document.getElementById('photo-upload')?.click(),
        variant: 'secondary',
        disabled: isNewLot
      },
      // 4. BACK
      {
        id: 'back',
        label: 'Back',
        icon: <ArrowLeft className="w-4 h-4" />,
        onClick: () => navigate(`/sales/${saleId}`),
        variant: 'secondary'
      },
      // 5. MAGIC (AI Enrich)
      {
        id: 'ai-enrich',
        label: 'Magic',
        icon: <Sparkles className="w-4 h-4" />,
        onClick: handleAIEnrich,
        variant: 'ai',
        disabled: photos.length === 0 || !isOnline
      },
      // 6. DELETE
      {
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: handleDelete,
        variant: 'danger',
        disabled: isNewLot
      }
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
            urls[photo.id] = URL.createObjectURL(blob);
          }
        }
      }

      // If online, also try loading from Supabase (for synced photos)
      if (isOnline) {
        const { data, error } = await supabase
          .from('photos')
          .select('*')
          .eq('lot_id', lotId)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          // Merge with local photos, preferring Supabase data for synced items
          const photoMap = new Map(photoData.map(p => [p.id, p]));
          
          for (const supabasePhoto of data) {
            photoMap.set(supabasePhoto.id, supabasePhoto);
            
            // Try to get URL if not already have one
            if (!urls[supabasePhoto.id] && supabasePhoto.file_path) {
              try {
                const { data: urlData } = await supabase.storage
                  .from('photos')
                  .createSignedUrl(supabasePhoto.file_path, 3600);

                if (urlData?.signedUrl) {
                  urls[supabasePhoto.id] = urlData.signedUrl;
                }
              } catch (urlError) {
                console.debug('Could not load URL for photo', supabasePhoto.id);
              }
            }
          }
          
          photoData = Array.from(photoMap.values());
        }
      }

      setPhotos(photoData);
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  /**
   * Open camera modal with full controls
   */
  const handleCamera = () => {
    if (isNewLot) {
      alert('Please save the lot first before adding photos');
      return;
    }
    
    // Open camera modal
    setShowCameraModal(true);
  };

  /**
   * Handle photo capture from camera modal
   */
  const handleCameraCapture = async (photoData: { base64String: string; format: string }) => {
    try {
      // Process photo with camera service
      const result = await CameraService.processCapturedPhoto(
        photoData,
        lotId!,
        photos.length === 0
      );
      
      if (result.success && result.photoId && result.blobUrl) {
        // Update UI immediately with new photo
        const newPhoto: Photo = {
          id: result.photoId,
          lot_id: lotId!,
          file_path: `${lotId}/${result.photoId}.jpg`,
          file_name: `Photo_${Date.now()}.jpg`,
          is_primary: photos.length === 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setPhotos(prev => [...prev, newPhoto]);
        setPhotoUrls(prev => ({
          ...prev,
          [result.photoId!]: result.blobUrl!
        }));

        console.log('✅ Photo added to gallery. Saved to device gallery & syncing to cloud...');
      } else if (result.error) {
        console.error('Camera error:', result.error);
        alert(result.error);
      }
    } catch (error) {
      console.error('Camera error:', error);
      alert('Failed to process photo');
    }
  };

  /**
   * Handle file upload
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (isNewLot) {
      alert('Please save the lot first before adding photos');
      return;
    }

    try {
      // INSTANT: Get blob URLs and update UI immediately
      const result = await CameraService.handleFileInput(files, lotId!);
      
      if (result.success > 0) {
        // Create photo metadata for UI
        const newPhotos: Photo[] = result.photos.map((p, index) => ({
          id: p.photoId,
          lot_id: lotId!,
          file_path: `${lotId}/${p.photoId}.jpg`,
          file_name: files[index].name,
          is_primary: photos.length === 0 && index === 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        // Create URL map
        const newUrls: Record<string, string> = {};
        result.photos.forEach(p => {
          newUrls[p.photoId] = p.blobUrl;
        });

        // Update UI immediately
        setPhotos(prev => [...prev, ...newPhotos]);
        setPhotoUrls(prev => ({ ...prev, ...newUrls }));

        console.log(`✅ ${result.success} photo(s) added instantly. Syncing in background...`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload photos');
    }

    // Reset input
    e.target.value = '';
  };

  // Helper function to convert text to title case
  const toTitleCase = (str: string) => {
    return str.toLowerCase().split(' ').map(word => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  };

  const handleSave = async () => {
    if (!lot.name || !saleId) {
      alert('Please enter an item name');
      return;
    }

    setSaving(true);
    try {
      const lotData = {
        ...lot,
        name: toTitleCase(lot.name),
        sale_id: saleId,
        updated_at: new Date().toISOString()
      };

      if (isOnline) {
        // Save to Supabase
        if (isNewLot) {
          const { data, error } = await supabase
            .from('lots')
            .insert(lotData)
            .select()
            .single();

          if (error) throw error;
          
          // Navigate to the new lot's edit page
          if (data) {
            navigate(`/sales/${saleId}/lots/${data.id}`, { replace: true });
          }
        } else {
          const { error } = await supabase
            .from('lots')
            .update(lotData)
            .eq('id', lotId);

          if (error) throw error;
          // Update local state to reflect title case
          setLot(prev => ({ ...prev, name: toTitleCase(prev.name || '') }));
        }
        
        alert('Item saved successfully');
      } else {
        // Save offline
        if (isNewLot) {
          // Generate temporary ID
          const tempId = `temp_lot_${Date.now()}`;
          const newLot = { ...lotData, id: tempId, created_at: new Date().toISOString() };
          await offlineStorage.upsertLot(newLot);
          await offlineStorage.addPendingSyncItem({
            id: tempId,
            type: 'create',
            table: 'lots',
            data: newLot
          });
          navigate(`/sales/${saleId}/lots/${tempId}`, { replace: true });
        } else {
          await offlineStorage.upsertLot({ ...lotData, id: lotId });
          await offlineStorage.addPendingSyncItem({
            id: lotId!,
            type: 'update',
            table: 'lots',
            data: lotData
          });
          // Update local state to reflect title case
          setLot(prev => ({ ...prev, name: toTitleCase(prev.name || '') }));
        }
        
        alert('Item saved locally (will sync when online)');
      }
    } catch (error: any) {
      console.error('Error saving lot:', error);
      alert(`Failed to save item: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNewLot || !lotId) return;

    if (!confirm(`Delete "${lot.name}"? This will also delete all photos. This cannot be undone.`)) {
      return;
    }

    try {
      if (isOnline) {
        // Delete photos from storage
        if (photos.length > 0) {
          const filePaths = photos.map(p => p.file_path);
          await supabase.storage.from('photos').remove(filePaths);
        }

        // Delete from database
        const { error } = await supabase
          .from('lots')
          .delete()
          .eq('id', lotId);

        if (error) throw error;
      } else {
        // Mark for deletion when back online
        await offlineStorage.addPendingSyncItem({
          id: lotId,
          type: 'delete',
          table: 'lots',
          data: { id: lotId }
        });
      }

      navigate(`/sales/${saleId}`);
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete item');
    }
  };

  const handleSetPrimary = async (photo: Photo) => {
    try {
      // Update primary status
      const updatedPhotos = photos.map(p => ({
        ...p,
        is_primary: p.id === photo.id
      }));

      // Update UI immediately
      setPhotos(updatedPhotos);

      // Update in database
      if (isOnline) {
        for (const p of updatedPhotos) {
          await supabase
            .from('photos')
            .update({ is_primary: p.is_primary })
            .eq('id', p.id);
        }
      }

      // Update in offline storage
      for (const p of updatedPhotos) {
        await offlineStorage.upsertPhoto(p);
      }
    } catch (error) {
      console.error('Error setting primary photo:', error);
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    if (!confirm('Delete this photo?')) return;

    try {
      // Remove from UI immediately
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      setPhotoUrls(prev => {
        const newUrls = { ...prev };
        delete newUrls[photo.id];
        return newUrls;
      });

      // Clean up blob URL
      if (photoUrls[photo.id]?.startsWith('blob:')) {
        URL.revokeObjectURL(photoUrls[photo.id]);
      }

      // Delete from storage
      if (isOnline) {
        await supabase.storage.from('photos').remove([photo.file_path]);
        await supabase.from('photos').delete().eq('id', photo.id);
      }

      // Delete from offline storage
      await offlineStorage.deletePhoto(photo.id);
      await offlineStorage.deletePhotoBlob(photo.id);
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  const handleAIEnrich = async () => {
    // AI enrichment logic here
    console.log('AI enrichment not yet implemented');
  };

  const formatPrice = (value: number | null | undefined) => {
    return value != null && !isNaN(value) ? String(value) : '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-32">
      {/* Hidden file input */}
      <input
        type="file"
        id="photo-upload"
        multiple
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(`/sales/${saleId}`)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNewLot ? 'New Item' : 'Edit Item'}
            </h1>
            {lot.lot_number && (
              <p className="text-sm text-gray-500">
                Lot #{lot.lot_number}
                {isTemporaryNumber(lot.lot_number) && (
                  <span className="ml-2 text-yellow-600">(Temporary)</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Photos Section - Only show after lot is saved */}
      {!isNewLot && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
            <div className="text-sm text-gray-500">
              {photos.length} photo{photos.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Photo Grid */}
          {photos.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm mb-2">No photos yet</p>
              <p className="text-xs text-gray-400">
                Use the Camera or Upload button to add photos
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100"
                >
                  {photoUrls[photo.id] ? (
                    <img
                      src={photoUrls[photo.id]}
                      alt={photo.file_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    </div>
                  )}

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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lot Details Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Item Details</h2>
          
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={lot.name || ''}
                  onChange={(e) => setLot({ ...lot, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="Enter item name"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={lot.description || ''}
                  onChange={(e) => setLot({ ...lot, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="Detailed description of the item"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  min="1"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  placeholder="e.g., Excellent, Good, Fair"
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

      {/* Camera Modal with Full Controls */}
      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}