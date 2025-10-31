import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { enrichLotData } from '../lib/Gemini';
import type { Lot, Photo } from '../types';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import PhotoGallery from './Photogallery';

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

  useEffect(() => {
    if (lotId && lotId !== 'new') {
      loadLot();
      loadPhotos();
    } else if (lotId === 'new') {
      // Reset form to initial empty state for new lot
      setLot({
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
      // Clear photos for new lot
      setPhotos([]);
      setPhotoUrls({});
      // Get next lot number
      getNextLotNumber();
    }
  }, [lotId]);

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

      console.log('Queried lot numbers:', data);

      // Handle cases where lot_number might be null or invalid
      const lotNumbers = data
        ?.map(item => item.lot_number)
        .filter(num => num != null && !isNaN(Number(num)))
        .map(num => Number(num)) || [];

      const maxNumber = lotNumbers.length > 0 ? Math.max(...lotNumbers) : 0;
      const nextNumber = maxNumber + 1;

      console.log('Max lot number found:', maxNumber);
      console.log('Next lot number will be:', nextNumber);

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
            .createSignedUrl(photo.file_path, 3600);
          
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

  const handleSave = async () => {
    if (!lot.name?.trim()) {
      alert('Please enter an item name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (lotId === 'new') {
        const { data, error } = await supabase
          .from('lots')
          .insert({
            ...lot,
            sale_id: saleId,
          })
          .select()
          .single();

        if (error) throw error;
        navigate(`/sales/${saleId}/lots/${data.id}`);
      } else {
        const { error } = await supabase
          .from('lots')
          .update({
            ...lot,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lotId);

        if (error) throw error;
        alert('Item saved successfully!');
      }
    } catch (error: any) {
      console.error('Error saving lot:', error);
      setError('Failed to save item: ' + error.message);
      alert('Failed to save item: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearForm = () => {
    if (!confirm('Clear all entered data and start fresh?')) {
      return;
    }

    // Reset to initial empty state
    setLot({
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

    // Get the next lot number
    getNextLotNumber();
    setError('');
  };

  const handleSaveAndAddAnother = async () => {
    if (!lot.name?.trim()) {
      alert('Please enter an item name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (lotId === 'new') {
        // Creating a new lot - insert it
        const { error } = await supabase
          .from('lots')
          .insert({
            ...lot,
            sale_id: saleId,
          });

        if (error) throw error;

        // Clear form and get next lot number (stay on /new page)
        setLot({
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

        await getNextLotNumber();
        setPhotos([]);
        setPhotoUrls({});
        alert('Item saved! Ready for next lot.');
      } else {
        // Editing an existing lot - update it first
        // Note: Photos are already saved individually as they're uploaded in PhotoGallery
        const { error } = await supabase
          .from('lots')
          .update({
            ...lot,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lotId);

        if (error) throw error;

        // Navigate to new lot creation page
        alert('Item and all photos saved successfully! Ready for next lot.');
        navigate(`/sales/${saleId}/lots/new`);
      }
    } catch (error: any) {
      console.error('Error saving lot:', error);
      setError('Failed to save item: ' + error.message);
      alert('Failed to save item: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAIEnrich = async () => {
    if (photos.length === 0) {
      alert('Please add photos before using AI enrichment');
      return;
    }

    if (!confirm('Use AI to enhance this item\'s description and details based on the photos?')) {
      return;
    }

    setAiLoading(true);
    setError('');

    try {
      // Get all photo URLs
      const photoUrlsList = await Promise.all(
        photos.map(async (photo) => {
          const { data } = await supabase.storage
            .from('photos')
            .createSignedUrl(photo.file_path, 3600);
          return data?.signedUrl || '';
        })
      );

      const validUrls = photoUrlsList.filter(url => url);

      if (validUrls.length === 0) {
        throw new Error('No valid photo URLs found');
      }

      // Call AI enrichment
      const enrichedData = await enrichLotData(validUrls);

      // Update lot with enriched data
      setLot(prev => ({
        ...prev,
        description: enrichedData.description || prev.description,
        category: enrichedData.category || prev.category,
        style: enrichedData.style || prev.style,
        origin: enrichedData.origin || prev.origin,
        creator: enrichedData.creator || prev.creator,
        materials: enrichedData.materials || prev.materials,
        condition: enrichedData.condition || prev.condition,
        estimate_low: enrichedData.estimate_low || prev.estimate_low,
        estimate_high: enrichedData.estimate_high || prev.estimate_high,
      }));

      alert('Item enriched with AI data! Review and save changes.');
    } catch (error: any) {
      console.error('Error enriching lot:', error);
      setError('Failed to enrich item: ' + error.message);
      alert('Failed to enrich item: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
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
            <h1 className="text-3xl font-bold text-gray-900">
              {lotId === 'new' ? 'New Item' : 'Edit Item'}
            </h1>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Photos */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-6">
              {lotId === 'new' ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">Save the item first to add photos</p>
                </div>
              ) : lotId ? (
                <PhotoGallery
                  lotId={lotId}
                  photos={photos}
                  photoUrls={photoUrls}
                  onPhotosChange={loadPhotos}
                  onNextLot={handleSaveAndAddAnother}
                />
              ) : null}
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="space-y-6">
                {/* Basic Info */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                    <div className="flex items-center gap-2">
                      {/* Action Buttons */}
                      <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors shadow-sm text-sm font-medium"
                      >
                        <Save className="w-4 h-4" />
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                      
                      <button
                        onClick={handleClearForm}
                        disabled={loading}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      
                      <button
                        onClick={() => navigate(`/sales/${saleId}`)}
                        disabled={loading}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        Close
                      </button>

                      {photos.length > 0 && (
                        <button
                          onClick={handleAIEnrich}
                          disabled={aiLoading}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm text-sm ml-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          {aiLoading ? 'Enriching...' : 'Apply AI Data'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Item Name *
                      </label>
                      <input
                        type="text"
                        value={lot.name || ''}
                        onChange={(e) => setLot({ ...lot, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Antique Oak Dining Table"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        value={lot.description || ''}
                        onChange={(e) => setLot({ ...lot, description: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Detailed description of the item..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lot Number
                        <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Auto-assigned</span>
                      </label>
                      <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 font-semibold">
                        {lot.lot_number || '—'}
                      </div>
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Furniture, Art, Jewelry"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        Height (in)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lot.height || ''}
                        onChange={(e) => setLot({ ...lot, height: parseFloat(e.target.value) || undefined })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Width (in)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lot.width || ''}
                        onChange={(e) => setLot({ ...lot, width: parseFloat(e.target.value) || undefined })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Depth (in)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lot.depth || ''}
                        onChange={(e) => setLot({ ...lot, depth: parseFloat(e.target.value) || undefined })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Weight (lbs)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={lot.weight || ''}
                        onChange={(e) => setLot({ ...lot, weight: parseFloat(e.target.value) || undefined })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Victorian, Mid-Century Modern"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., France, China, United States"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Artist name, manufacturer"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Oak, Mahogany, Bronze"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Consignor name or ID"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}