import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lot } from '../types';
import { Plus, Package, DollarSign, Edit, Trash2, Image, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LotsListProps {
  lots: Lot[];
  saleId: string;
  onRefresh: () => void;
}

export default function LotsList({ lots, saleId, onRefresh }: LotsListProps) {
  const navigate = useNavigate();

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.map((lot) => (
            <div
              key={lot.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={() => navigate(`/sales/${saleId}/lots/${lot.id}`)}
            >
              {/* Image Placeholder */}
              <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                <Image className="w-12 h-12 text-gray-400" />
                
                {/* Featured badge - if you add a featured field to your Lot type */}
                {(lot as any).is_featured && (
                  <div className="absolute top-2 right-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  </div>
                )}
              </div>
              
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    {lot.lot_number && (
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        LOT #{lot.lot_number}
                      </p>
                    )}
                    <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {lot.name}
                    </h3>
                  </div>
                  
                  {/* Action buttons - PhotoInventory style */}
                  <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/sales/${saleId}/lots/${lot.id}`);
                      }}
                      className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                      aria-label="Edit lot"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(lot);
                      }}
                      className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-all"
                      aria-label="Delete lot"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {lot.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                    {lot.description}
                  </p>
                )}

                {/* Estimate */}
                {(lot.estimate_low || lot.estimate_high) && (
                  <div className="flex items-center gap-1 text-sm text-gray-700 mb-3">
                    <DollarSign className="w-4 h-4" />
                    <span>
                      {formatPrice(lot.estimate_low)} - {formatPrice(lot.estimate_high)}
                    </span>
                  </div>
                )}

                {/* Category badge */}
                {lot.category && (
                  <div>
                    <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                      {lot.category}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}