import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { enrichLotData } from '../lib/Gemini'; // Changed from 'import type'
import type { Lot, Photo } from '../types';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import PhotoGallery from './Photogallery';

export default function LotDetail() {
  const { saleId, lotId } = useParams<{ saleId: string; lotId: string }>();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Partial<Lot>>({
    name: '',
    description: '',
    lot_number: undefined,
    category: '',
    style: '',
    origin: '',
    creator: '',
    materials: '',
    condition: '',
    estimate_low: undefined,
    estimate_high: undefined,
    starting_bid: undefined,
    reserve_price: undefined,
    buy_now_price: undefined,
    height: undefined,
    width: undefined,
    depth: undefined,
    weight: undefined,
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');

  const isNewLot = lotId === 'new';

  useEffect(() => {
    if (!isNewLot) {
      loadLot();
    } else {
      setLoading(false);
    }
  }, [lotId, isNewLot]);

  const loadLot = async () => {
    if (!lotId || lotId === 'new') return;

    setLoading(true);
    try {
      const { data: lotData, error: lotError } = await supabase
        .from('lots')
        .select('*')
        .eq('id', lotId)
        .single();

      if (lotError) throw lotError;
      setLot(lotData);

      const { data: photosData, error: photosError } = await supabase
        .from('photos')
        .select('*')
        .eq('lot_id', lotId)
        .order('display_order', { ascending: true });

      if (photosError) throw photosError;
      setPhotos(photosData || []);
      await loadPhotoUrls(photosData || []);
    } catch (err: any) {
      console.error('Error loading lot:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPhotoUrls = async (photosData: Photo[]) => {
    const urls: Record<string, string> = {};
    for (const photo of photosData) {
      const { data } = await supabase.storage
        .from('photos')
        .createSignedUrl(photo.file_path, 3600);
      if (data?.signedUrl) {
        urls[photo.id] = data.signedUrl;
      }
    }
    setPhotoUrls(urls);
  };

  const handleSave = async () => {
    if (!lot.name?.trim()) {
      alert('Item name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (isNewLot) {
        const { data, error: insertError } = await supabase
          .from('lots')
          .insert({
            ...lot,
            sale_id: saleId,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        navigate(`/sales/${saleId}/lots/${data.id}`);
      } else {
        const { error: updateError } = await supabase
          .from('lots')
          .update(lot)
          .eq('id', lotId);

        if (updateError) throw updateError;
        alert('Item saved successfully!');
      }
    } catch (err: any) {
      console.error('Error saving lot:', err);
      setError(err.message);
      alert('Failed to save item: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEnrichWithAI = async () => {
    if (photos.length === 0) {
      alert('Please add at least one photo before enriching with AI');
      return;
    }

    setEnriching(true);
    setError('');

    try {
      const validUrls = Object.values(photoUrls).filter(url => url && url.trim() !== '');

      if (validUrls.length === 0) {
        throw new Error('No valid photo URLs found');
      }

      const enrichedData = await enrichLotData(validUrls);

      // Map the enriched data to lot fields using correct property names
      setLot(prev => ({
        ...prev,
        description: enrichedData.enrichedDescription || prev.description,
        category: enrichedData.suggestedCategory || prev.category,
        condition: enrichedData.condition || prev.condition,
        // Note: The AI returns 'estimatedPeriod' and 'keywords' but we don't have fields for those
        // You may want to add these fields to your Lot type or append them to description
      }));

      alert('Item enriched with AI data! Review and save changes.');
    } catch (error: any) {
      console.error('Error enriching lot:', error);
      setError('Failed to enrich item: ' + error.message);
      alert('Failed to enrich item: ' + error.message);
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading item...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(`/sales/${saleId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Sale
          </button>

          <div className="flex gap-2">
            {photos.length > 0 && (
              <button
                onClick={handleEnrichWithAI}
                disabled={enriching}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {enriching ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Enriching...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Enrich with AI
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Item
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              {isNewLot ? 'New Item' : 'Edit Item'}
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name *
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={lot.name || ''}
                    onChange={(e) => setLot({ ...lot, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Victorian Oak Table"
                  />
                </div>

                <div>
                  <label htmlFor="lot_number" className="block text-sm font-medium text-gray-700 mb-1">
                    Lot Number
                  </label>
                  <input
                    id="lot_number"
                    type="number"
                    value={lot.lot_number || ''}
                    onChange={(e) => setLot({ ...lot, lot_number: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 101"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={lot.description || ''}
                    onChange={(e) => setLot({ ...lot, description: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Detailed description of the item..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      id="category"
                      type="text"
                      value={lot.category || ''}
                      onChange={(e) => setLot({ ...lot, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., Furniture"
                    />
                  </div>

                  <div>
                    <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-1">
                      Condition
                    </label>
                    <input
                      id="condition"
                      type="text"
                      value={lot.condition || ''}
                      onChange={(e) => setLot({ ...lot, condition: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., Excellent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="style" className="block text-sm font-medium text-gray-700 mb-1">
                      Style/Period
                    </label>
                    <input
                      id="style"
                      type="text"
                      value={lot.style || ''}
                      onChange={(e) => setLot({ ...lot, style: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., Victorian"
                    />
                  </div>

                  <div>
                    <label htmlFor="origin" className="block text-sm font-medium text-gray-700 mb-1">
                      Origin
                    </label>
                    <input
                      id="origin"
                      type="text"
                      value={lot.origin || ''}
                      onChange={(e) => setLot({ ...lot, origin: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., England"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="creator" className="block text-sm font-medium text-gray-700 mb-1">
                      Creator/Maker
                    </label>
                    <input
                      id="creator"
                      type="text"
                      value={lot.creator || ''}
                      onChange={(e) => setLot({ ...lot, creator: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., John Smith"
                    />
                  </div>

                  <div>
                    <label htmlFor="materials" className="block text-sm font-medium text-gray-700 mb-1">
                      Materials
                    </label>
                    <input
                      id="materials"
                      type="text"
                      value={lot.materials || ''}
                      onChange={(e) => setLot({ ...lot, materials: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., Oak, Brass"
                    />
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="estimate_low" className="block text-sm font-medium text-gray-700 mb-1">
                        Estimate Low
                      </label>
                      <input
                        id="estimate_low"
                        type="number"
                        value={lot.estimate_low || ''}
                        onChange={(e) => setLot({ ...lot, estimate_low: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="500"
                      />
                    </div>

                    <div>
                      <label htmlFor="estimate_high" className="block text-sm font-medium text-gray-700 mb-1">
                        Estimate High
                      </label>
                      <input
                        id="estimate_high"
                        type="number"
                        value={lot.estimate_high || ''}
                        onChange={(e) => setLot({ ...lot, estimate_high: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="1000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <label htmlFor="starting_bid" className="block text-sm font-medium text-gray-700 mb-1">
                        Starting Bid
                      </label>
                      <input
                        id="starting_bid"
                        type="number"
                        value={lot.starting_bid || ''}
                        onChange={(e) => setLot({ ...lot, starting_bid: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="250"
                      />
                    </div>

                    <div>
                      <label htmlFor="reserve_price" className="block text-sm font-medium text-gray-700 mb-1">
                        Reserve Price
                      </label>
                      <input
                        id="reserve_price"
                        type="number"
                        value={lot.reserve_price || ''}
                        onChange={(e) => setLot({ ...lot, reserve_price: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="400"
                      />
                    </div>

                    <div>
                      <label htmlFor="buy_now_price" className="block text-sm font-medium text-gray-700 mb-1">
                        Buy Now Price
                      </label>
                      <input
                        id="buy_now_price"
                        type="number"
                        value={lot.buy_now_price || ''}
                        onChange={(e) => setLot({ ...lot, buy_now_price: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="1200"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Dimensions</h3>
                  
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-1">
                        Height (in)
                      </label>
                      <input
                        id="height"
                        type="number"
                        step="0.1"
                        value={lot.height || ''}
                        onChange={(e) => setLot({ ...lot, height: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="36"
                      />
                    </div>

                    <div>
                      <label htmlFor="width" className="block text-sm font-medium text-gray-700 mb-1">
                        Width (in)
                      </label>
                      <input
                        id="width"
                        type="number"
                        step="0.1"
                        value={lot.width || ''}
                        onChange={(e) => setLot({ ...lot, width: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="48"
                      />
                    </div>

                    <div>
                      <label htmlFor="depth" className="block text-sm font-medium text-gray-700 mb-1">
                        Depth (in)
                      </label>
                      <input
                        id="depth"
                        type="number"
                        step="0.1"
                        value={lot.depth || ''}
                        onChange={(e) => setLot({ ...lot, depth: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="24"
                      />
                    </div>

                    <div>
                      <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">
                        Weight (lbs)
                      </label>
                      <input
                        id="weight"
                        type="number"
                        step="0.1"
                        value={lot.weight || ''}
                        onChange={(e) => setLot({ ...lot, weight: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="75"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <PhotoGallery
                  photos={photos}
                  photoUrls={photoUrls}
                  lotId={lotId === 'new' ? '' : lotId || ''}
                  onPhotosChange={loadLot}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}