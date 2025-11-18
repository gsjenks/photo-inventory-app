// src/components/LotsList.tsx
// Displays lot cards with quantity field above category

import { useNavigate } from 'react-router-dom';
import type { Lot } from '../types';
import { Edit2, Trash2, Package } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface LotsListProps {
  lots: Lot[];
  saleId: string;
  onRefresh: () => void;
}

export default function LotsList({ lots, saleId, onRefresh }: LotsListProps) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleEdit = (lotId: string) => {
    navigate(`/sales/${saleId}/lots/${lotId}`);
  };

  const handleDelete = async (lot: Lot) => {
    if (!window.confirm(`Delete lot #${lot.lot_number}? This cannot be undone.`)) {
      return;
    }

    setDeleting(lot.id);
    try {
      // Delete associated photos from storage
      const { data: photos } = await supabase
        .from('photos')
        .select('file_path')
        .eq('lot_id', lot.id);

      if (photos && photos.length > 0) {
        const filePaths = photos.map(p => p.file_path);
        await supabase.storage.from('photos').remove(filePaths);
      }

      // Delete lot
      const { error } = await supabase
        .from('lots')
        .delete()
        .eq('id', lot.id);

      if (error) throw error;

      onRefresh();
    } catch (error) {
      console.error('Error deleting lot:', error);
      alert('Failed to delete lot');
    } finally {
      setDeleting(null);
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '';
    return `$${value.toLocaleString()}`;
  };

  const formatDimensions = (lot: Lot) => {
    const parts = [];
    if (lot.height) parts.push(`H: ${lot.height}"`);
    if (lot.width) parts.push(`W: ${lot.width}"`);
    if (lot.depth) parts.push(`D: ${lot.depth}"`);
    
    let result = parts.join(' × ');
    
    if (lot.weight) {
      result += ` • ${lot.weight} lbs`;
    }
    
    return result || 'Not specified';
  };

  if (lots.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg mb-2">No items yet</p>
        <p className="text-gray-400 text-sm">
          Add your first item to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {lots.map((lot) => (
        <div
          key={lot.id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start gap-6">
            {/* Left side - Details */}
            <div className="flex-1 min-w-0">
              {/* Lot Number */}
              <div className="mb-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  LOT #{lot.lot_number || 'TBD'}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                {lot.name}
              </h3>

              {/* Pricing Grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Estimate</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {lot.estimate_low && lot.estimate_high ? (
                      `${formatCurrency(lot.estimate_low)} - ${formatCurrency(lot.estimate_high)}`
                    ) : lot.estimate_low ? (
                      formatCurrency(lot.estimate_low)
                    ) : (
                      <span className="text-gray-400 text-sm">Not set</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-500 mb-1">Starting Bid</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {lot.starting_bid ? (
                      formatCurrency(lot.starting_bid)
                    ) : (
                      <span className="text-gray-400 text-sm">Not set</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Dimensions & Weight */}
              <div className="mb-4">
                <div className="text-sm text-gray-500 mb-1">Dimensions & Weight</div>
                <div className="text-base font-medium text-gray-900">
                  {formatDimensions(lot)}
                </div>
              </div>

              {/* QUANTITY - NEW FIELD ADDED HERE */}
              {lot.quantity && lot.quantity > 1 && (
                <div className="mb-4">
                  <div className="text-sm text-gray-500 mb-1">Quantity</div>
                  <div className="inline-flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-600" />
                    <span className="text-base font-semibold text-gray-900">
                      {lot.quantity} {lot.quantity === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
              )}

              {/* Category */}
              {lot.category && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Category</div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700">
                    {lot.category}
                  </span>
                </div>
              )}
            </div>

            {/* Right side - Image & Actions */}
            <div className="flex flex-col items-end gap-3">
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(lot.id)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit item"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => handleDelete(lot)}
                  disabled={deleting === lot.id}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete item"
                >
                  {deleting === lot.id ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-600 border-t-transparent"></div>
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Primary Photo */}
              <div className="w-40 h-40 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                {/* TODO: Add photo display when photo service is connected */}
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}