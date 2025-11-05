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
  X,
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
  const [aiProcessing, setAiProcessing] = useState(false);
  const isNewLot = lotId === 'new';

  // Monitor connectivity
  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange((online) => {
      setIsOnline(online);
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
      {
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: handleDelete,
        variant: 'danger',
        disabled: isNewLot
      },
      {
        id: 'camera',
        label: 'Camera',
        icon: <Camera className="w-4 h-4" />,
        onClick: handleCamera,
        variant: 'secondary'
      },
      {
        id: 'upload',
        label: 'Upload Photos',
        icon: <Upload className="w-4 h-4" />,
        onClick: () => document.getElementById('photo-upload')?.click(),
        variant: 'secondary'
      },
      {
        id: 'ai-enrich',
        label: 'AI Enrich',
        icon: <Sparkles className="w-4 h-4" />,
        onClick: handleAIEnrich,
        variant: 'ai',
        disabled: photos.length === 0 || aiProcessing,
        loading: aiProcessing
      },
      {
        id: 'save',
        label: isNewLot ? 'Create Item' : 'Save Changes',
        icon: <Save className="w-4 h-4" />,
        onClick: handleSave,
        variant: 'primary',
        disabled: !lot.name || saving,
        loading: saving
      }
    ]);

    return () => clearActions();
  }, [lot, photos, isNewLot, saving, aiProcessing]);

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
          data.forEach(p => photoMap.set(p.id, p));
          photoData = Array.from(photoMap.values());

          // Load Supabase URLs for synced photos
          for (const photo of data) {
            if (!urls[photo.id]) {
              const { data: urlData } = await supabase.storage
                .from('photos')
                .createSignedUrl(photo.file_path, 3600);
              
              if (urlData?.signedUrl) {
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

  const handleCamera = async () => {
    if (isNewLot) {
      alert('Please save the lot first before adding photos');
      return;
    }

    try {
      const result = await CameraService.captureAndSave(lotId!, photos.length === 0);
      
      if (result.success) {
        await loadPhotos();
      } else if (result.error) {
        alert(`Failed to capture photo: ${result.error}`);
      }
    } catch (error) {
      console.error('Camera error:', error);
      alert('Failed to access camera');
    }
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
        // Queue for deletion when online
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!isOnline) {
      alert('Photo upload requires an internet connection');
      return;
    }

    try {
      for (const file of Array.from(files)) {
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${saleId}/${lotId}/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Create photo record
        const { error: insertError } = await supabase
          .from('photos')
          .insert({
            lot_id: lotId,
            file_path: filePath,
            file_name: file.name,
            is_primary: photos.length === 0
          });

        if (insertError) throw insertError;
      }

      // Reload photos
      await loadPhotos();
      alert(`${files.length} photo(s) uploaded successfully`);
    } catch (error) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos');
    }
  };

  const handleSetPrimaryPhoto = async (photoId: string) => {
    try {
      // Set all photos to non-primary
      await supabase
        .from('photos')
        .update({ is_primary: false })
        .eq('lot_id', lotId);

      // Set selected photo as primary
      await supabase
        .from('photos')
        .update({ is_primary: true })
        .eq('id', photoId);

      await loadPhotos();
    } catch (error) {
      console.error('Error setting primary photo:', error);
    }
  };

  const handleDeletePhoto = async (photoId: string, filePath: string) => {
    if (!confirm('Delete this photo?')) return;

    try {
      // Delete from storage
      await supabase.storage.from('photos').remove([filePath]);

      // Delete record
      await supabase
        .from('photos')
        .delete()
        .eq('id', photoId);

      await loadPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  };

  const handleAIEnrich = async () => {
    if (photos.length === 0) {
      alert('Please upload photos first');
      return;
    }

    if (!isOnline) {
      alert('AI enrichment requires an internet connection');
      return;
    }

    setAiProcessing(true);
    try {
      // TODO: Implement AI enrichment
      // This would call your Gemini AI service
      alert('AI enrichment feature coming soon');
    } catch (error) {
      console.error('Error with AI enrichment:', error);
      alert('AI enrichment failed');
    } finally {
      setAiProcessing(false);
    }
  };

  const formatPrice = (value: any) => value !== undefined && value !== null ? value : '';

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-28">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/sales/${saleId}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sale
        </button>
        
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">
              {isNewLot ? 'New Item' : 'Edit Item'}
            </h1>
            {lot.lot_number && (
              <div className="flex items-center gap-2 mt-2">
                <p className="text-lg font-semibold text-indigo-600">
                  LOT #{lot.lot_number}
                </p>
                {isTemporaryNumber(lot.lot_number) && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                    Temp (will sync)
                  </span>
                )}
              </div>
            )}
          </div>
          
          {!isOnline && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
              <p className="text-sm text-yellow-800 font-medium">Offline Mode</p>
              <p className="text-xs text-yellow-600">Changes will sync when online</p>
            </div>
          )}
        </div>
      </div>

      {/* Photo Upload Input (Hidden) */}
      <input
        id="photo-upload"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Main Form */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 space-y-6">
        {/* Photos Section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Photos</h2>
          
          {photos.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No photos yet</p>
              <p className="text-sm text-gray-500">Use the buttons at the bottom to add photos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={photoUrls[photo.id]}
                      alt={photo.file_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* Photo Actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!photo.is_primary && (
                      <button
                        onClick={() => handleSetPrimaryPhoto(photo.id)}
                        className="p-1 bg-white rounded-full shadow hover:bg-gray-100"
                        title="Set as primary"
                      >
                        <Star className="w-4 h-4 text-gray-600" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePhoto(photo.id, photo.file_path)}
                      className="p-1 bg-white rounded-full shadow hover:bg-red-50"
                      title="Delete photo"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>

                  {/* Primary Badge */}
                  {photo.is_primary && (
                    <div className="absolute top-2 left-2">
                      <div className="bg-indigo-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Star className="w-3 h-3 fill-current" />
                        Primary
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item Name *
              </label>
              <input
                type="text"
                value={lot.name || ''}
                onChange={(e) => setLot({ ...lot, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="e.g., Victorian Walnut Dresser"
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
                placeholder="Detailed description of the item..."
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
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
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
                <option value="">Select condition...</option>
                <option value="Excellent">Excellent</option>
                <option value="Very Good">Very Good</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
                <option value="As-Is">As-Is</option>
              </select>
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
        <div className="space-y-4">
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
        <div className="space-y-4">
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
        <div className="space-y-4">
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
  );
}