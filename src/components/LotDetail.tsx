import React, { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (lotId && lotId !== 'new') {
      loadLot();
      loadPhotos();
    }
  }, [lotId]);

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
      }

      await loadPhotos();
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      alert('Failed to upload photos: ' + error.message);
    } finally {
      setLoading(false);
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
                      <img
                        src={`https://via.placeholder.com/300`}
                        alt={photo.file_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {photo.is_primary && (
                      <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Primary
                      </div>
                    )}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      {!photo.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(photo)}
                          className="p-1 bg-white rounded shadow hover:bg-gray-100"
                          title="Set as primary"
                        >
                          <Star className="w-4 h-4 text-gray-600" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePhoto(photo)}
                        className="p-1 bg-white rounded shadow hover:bg-red-50"
                      >
                        <X className="w-4 h-4 text-red-600" />
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
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {aiLoading ? 'AI Analyzing...' : 'AI Enrich Data'}
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
                      Name *
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
    onChange={(e) => setLot({ ...lot, lot_number: parseInt(e.target.value) || undefined })}
    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
