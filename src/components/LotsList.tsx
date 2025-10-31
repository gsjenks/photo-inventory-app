import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lot } from '../types';
import { Plus, Package, DollarSign, Edit, Trash2, Image, Star, Ruler, Weight as WeightIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import LotViewModal from './LotViewModal';

interface LotsListProps {
  lots: Lot[];
  saleId: string;
  onRefresh: () => void;
}

export default function LotsList({ lots, saleId, onRefresh }: LotsListProps) {
  const navigate = useNavigate();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);

  // Load primary photos for all lots
  useEffect(() => {
    loadPrimaryPhotos();
  }, [lots]);

  const loadPrimaryPhotos = async () => {
    if (lots.length === 0) return;

    setLoadingPhotos(true);
    try {
      const urls: Record<string, string> = {};
      
      for (const lot of lots) {
        // Get primary photo for this lot
        const { data: photos } = await supabase
          .from('photos')
          .select('*')
          .eq('lot_id', lot.id)
          .eq('is_primary', true)
          .limit(1);

        if (photos && photos.length > 0) {
          const photo = photos[0];
          const { data: urlData } = await supabase.storage
            .from('photos')
            .createSignedUrl(photo.file_path, 3600);

          if (urlData?.signedUrl) {
            urls[lot.id] = urlData.signedUrl;
          }
        }
      }
      
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading primary photos:', error);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleDelete = async (lot: Lot) => {
    if (!confirm(`Delete lot "${lot.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('lots')
        .delete()
        .eq('id', lot.id);

      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete lot');
    }
  };

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDimensions = (lot: Lot) => {
    const parts = [];
    if (lot.height) parts.push(`H: ${lot.height}"`);
    if (lot.width) parts.push(`W: ${lot.width}"`);
    if (lot.depth) parts.push(`D: ${lot.depth}"`);
    return parts.length > 0 ? parts.join(' × ') : '-';
  };

  const formatWeight = (weight?: number) => {
    if (!weight) return '-';
    return `${weight} lbs`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">All Items</h2>
        <button
          onClick={() => navigate(`/sales/${saleId}/lots/new`)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          New Item
        </button>
      </div>

      {lots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Package className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">No items yet</p>
          <button
            onClick={() => navigate(`/sales/${saleId}/lots/new`)}
            className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
          >
            Add your first item
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {lots.map((lot) => (
            <div
              key={lot.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow group relative"
            >
              {/* Action buttons - Top Right, above image */}
              <div className="absolute top-4 right-40 flex items-center gap-1 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/sales/${saleId}/lots/${lot.id}`);
                  }}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shadow-sm border border-gray-200"
                  aria-label="Edit lot"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(lot);
                  }}
                  className="p-1.5 rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-all shadow-sm border border-gray-200"
                  aria-label="Delete lot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                {/* Main Content Container - Flex Row */}
                <div className="flex gap-4">
                  {/* Left Side - Lot Details */}
                  <div className="flex-1">
                    {/* Lot Header */}
                    <div className="mb-3">
                      {/* Lot Number */}
                      {lot.lot_number && (
                        <p className="text-sm font-bold text-indigo-600 mb-1">
                          LOT #{lot.lot_number}
                        </p>
                      )}
                      {/* Lot Name */}
                      <h3 
                        onClick={() => setSelectedLot(lot)}
                        className="text-lg font-semibold text-gray-900 hover:text-indigo-600 transition-colors mb-2 cursor-pointer"
                      >
                        {lot.name}
                      </h3>
                    </div>

                    {/* Details Grid */}
                    <div 
                      className="grid grid-cols-2 gap-4 cursor-pointer"
                      onClick={() => setSelectedLot(lot)}
                    >
                      {/* Estimate Range */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Estimate</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {lot.estimate_low || lot.estimate_high ? (
                            <>
                              {formatPrice(lot.estimate_low)} - {formatPrice(lot.estimate_high)}
                            </>
                          ) : (
                            '-'
                          )}
                        </p>
                      </div>

                      {/* Starting Bid */}
                      {lot.starting_bid && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Starting Bid</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatPrice(lot.starting_bid)}
                          </p>
                        </div>
                      )}

                      {/* Reserve Price */}
                      {lot.reserve_price && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Reserve</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatPrice(lot.reserve_price)}
                          </p>
                        </div>
                      )}

                      {/* Buy Now Price */}
                      {lot.buy_now_price && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Buy Now</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatPrice(lot.buy_now_price)}
                          </p>
                        </div>
                      )}

                      {/* Dimensions */}
                      {(lot.height || lot.width || lot.depth) && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Dimensions</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatDimensions(lot)}
                          </p>
                        </div>
                      )}

                      {/* Weight */}
                      {lot.weight && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Weight</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatWeight(lot.weight)}
                          </p>
                        </div>
                      )}

                      {/* Category */}
                      {lot.category && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Category</p>
                          <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            {lot.category}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side - Primary Photo Thumbnail */}
                  <div className="flex-shrink-0">
                    <div 
                      className="w-32 h-32 bg-gray-100 flex items-center justify-center relative p-2 rounded cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => setSelectedLot(lot)}
                    >
                      {photoUrls[lot.id] ? (
                        <img 
                          src={photoUrls[lot.id]} 
                          alt={lot.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : (
                        <Image className="w-12 h-12 text-gray-400" />
                      )}
                      
                      {/* Featured badge */}
                      {(lot as any).is_featured && (
                        <div className="absolute -top-1 -right-1">
                          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lot View Modal */}
      {selectedLot && (
        <LotViewModal
          lot={selectedLot}
          saleId={saleId}
          onClose={() => setSelectedLot(null)}
          onDelete={() => {
            setSelectedLot(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}