import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lot } from '../types';
import { Package, Edit, Trash2, Image, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import offlineStorage from '../services/Offlinestorage';
import LotViewModal from './Lotviewmodal';

interface LotsListProps {
  lots: Lot[];
  saleId: string;
  onRefresh: () => void;
}

export default function LotsList({ lots, saleId, onRefresh }: LotsListProps) {
  const navigate = useNavigate();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);

  // Load primary photos for all lots
  useEffect(() => {
    if (lots?.length > 0) {
      loadPrimaryPhotos();
    } else {
      setPhotoUrls({});
    }
  }, [lots]);

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

  const loadPrimaryPhotos = async () => {
    if (!lots?.length) return;

    try {
      const urls: Record<string, string> = {};
      
      for (const lot of lots) {
        if (!lot?.id) continue;

        // Try loading from IndexedDB first (for local/offline photos)
        const localPhotos = await offlineStorage.getPhotosByLot(lot.id);
        const primaryLocal = localPhotos.find(p => p.is_primary);
        
        if (primaryLocal) {
          const blob = await offlineStorage.getPhotoBlob(primaryLocal.id);
          if (blob) {
            urls[lot.id] = URL.createObjectURL(blob);
            continue;
          }
        }

        // If not found locally, try Supabase
        try {
          const { data: photos, error: photosError } = await supabase
            .from('photos')
            .select('*')
            .eq('lot_id', lot.id)
            .eq('is_primary', true)
            .limit(1);

          if (photosError) {
            console.debug('Photos query error for lot', lot.id, ':', photosError);
            continue;
          }

          if (photos && photos.length > 0) {
            const photo = photos[0];
            
            if (!photo.file_path) {
              console.debug(`No file_path for photo ${photo.id}`);
              continue;
            }

            try {
              const { data: urlData, error: storageError } = await supabase.storage
                .from('photos')
                .createSignedUrl(photo.file_path, 3600);

              if (storageError) {
                console.debug('Storage URL error for lot', lot.id, ':', storageError.message);
                continue;
              }

              if (urlData?.signedUrl) {
                urls[lot.id] = urlData.signedUrl;
              }
            } catch (urlError) {
              console.debug('URL creation failed for lot', lot.id, ':', urlError);
            }
          }
        } catch (supabaseError) {
          console.debug('Supabase photo fetch failed for lot', lot.id, ':', supabaseError);
        }
      }
      
      setPhotoUrls(urls);
    } catch (error) {
      console.error('Error loading primary photos:', error);
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
      {!lots?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Package className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">No items yet</p>
          <p className="text-xs text-gray-500">Use the "New Item" button at the bottom to add your first item</p>
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
                        className="text-lg font-semibold text-gray-900 hover:text-indigo-600 transition-colors mb-2 cursor-pointer capitalize"
                      >
                        {lot.name}
                      </h3>
                    </div>

                    {/* Details Grid - REDUCED METADATA */}
                    <div 
                      className="grid grid-cols-2 gap-4 cursor-pointer"
                      onClick={() => setSelectedLot(lot)}
                    >
                      {/* Estimate Range */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Estimate</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(lot.estimate_low)} - {formatPrice(lot.estimate_high)}
                        </p>
                      </div>

                      {/* Starting Bid */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Starting Bid</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(lot.starting_bid)}
                        </p>
                      </div>

                      {/* Dimensions & Weight - Combined */}
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Dimensions & Weight</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatDimensions(lot)} • {formatWeight(lot.weight)}
                        </p>
                      </div>

                      {/* Category */}
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Category</p>
                        {lot.category ? (
                          <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            {lot.category}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </div>
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
          onClose={() => {
            setSelectedLot(null);
            loadPrimaryPhotos();
          }}
          onDelete={() => {
            setSelectedLot(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}