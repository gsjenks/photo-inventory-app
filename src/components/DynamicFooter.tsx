import { useLocation, useParams } from 'react-router-dom';
import { Plus, Save, Camera, Upload, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConnectivityService from '../services/ConnectivityService';

interface DynamicFooterProps {
  // Dashboard-specific props
  onAddSale?: () => void;
  onAddContact?: () => void;
  onAddDocument?: () => void;
  activeTab?: string;
  
  // LotDetail-specific props
  onSave?: () => void;
  onAIEnrich?: () => void;
  onCamera?: () => void;
  onUpload?: () => void;
  saving?: boolean;
  enriching?: boolean;
  disablePhotoButtons?: boolean;
  
  // SaleDetail-specific props
  onAddLot?: () => void;
  
  // Global
  showConnectionStatus?: boolean;
}

export default function DynamicFooter({
  onAddSale,
  onAddContact,
  onAddDocument,
  onAddLot,
  onSave,
  onAIEnrich,
  onCamera,
  onUpload,
  activeTab,
  saving = false,
  enriching = false,
  disablePhotoButtons = false,
  showConnectionStatus = true,
}: DynamicFooterProps) {
  const location = useLocation();
  const { saleId, lotId } = useParams<{ saleId?: string; lotId?: string }>();
  const [isOnline, setIsOnline] = useState(true);

  // ✅ FIXED: Monitor connectivity using correct method names with proper types
  useEffect(() => {
    // Get initial status using the correct method name
    setIsOnline(ConnectivityService.getConnectionStatus());
    
    // Subscribe to status changes with explicit callback type
    const unsubscribe = ConnectivityService.onStatusChange((online: boolean) => {
      setIsOnline(online);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Determine current page context
  const isDashboard = location.pathname === '/';
  const isSaleDetail = location.pathname.includes('/sales/') && !location.pathname.includes('/lots/');
  const isLotDetail = location.pathname.includes('/lots/');

  // Render nothing if no actions are available
  const hasActions = onAddSale || onAddContact || onAddDocument || onAddLot || onSave || onAIEnrich || onCamera || onUpload;
  if (!hasActions) return null;

  // Dashboard Footer - context-aware based on active tab
  if (isDashboard) {
    return (
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Connection Status */}
            {showConnectionStatus && (
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-600 hidden sm:inline">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-600" />
                    <span className="text-xs text-gray-600 hidden sm:inline">Offline</span>
                  </>
                )}
              </div>
            )}

            {/* Context-aware action buttons */}
            <div className="flex items-center gap-3 ml-auto">
              {activeTab === 'sales' && onAddSale && (
                <button
                  onClick={onAddSale}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all hover:shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">Add Sale</span>
                </button>
              )}

              {activeTab === 'contacts' && onAddContact && (
                <button
                  onClick={onAddContact}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all hover:shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">Add Contact</span>
                </button>
              )}

              {activeTab === 'documents' && onAddDocument && (
                <button
                  onClick={onAddDocument}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all hover:shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">Add Document</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    );
  }

  // Sale Detail Footer - context-aware based on active tab
  if (isSaleDetail && saleId) {
    return (
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Connection Status */}
            {showConnectionStatus && (
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-600 hidden sm:inline">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-600" />
                    <span className="text-xs text-gray-600 hidden sm:inline">Offline</span>
                  </>
                )}
              </div>
            )}

            {/* Context-aware action buttons */}
            <div className="flex items-center gap-3 ml-auto">
              {activeTab === 'items' && onAddLot && (
                <button
                  onClick={onAddLot}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all hover:shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium hidden sm:inline">Add</span>
                  <span className="font-medium">Lot</span>
                </button>
              )}

              {activeTab === 'contacts' && onAddContact && (
                <button
                  onClick={onAddContact}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all hover:shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium hidden sm:inline">Add</span>
                  <span className="font-medium">Contact</span>
                </button>
              )}

              {activeTab === 'documents' && onAddDocument && (
                <button
                  onClick={onAddDocument}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all hover:shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span className="font-medium hidden sm:inline">Add</span>
                  <span className="font-medium">Document</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    );
  }

  // Lot Detail Footer - photo and editing actions
  if (isLotDetail && lotId) {
    return (
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Connection Status */}
            {showConnectionStatus && (
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-600 hidden sm:inline">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-600" />
                    <span className="text-xs text-gray-600 hidden sm:inline">Offline - Changes saved locally</span>
                  </>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-auto">
              {/* Camera button */}
              {onCamera && (
                <button
                  onClick={onCamera}
                  disabled={disablePhotoButtons}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
                  title={disablePhotoButtons ? "Save the lot first to add photos" : "Take photo"}
                >
                  <Camera className="w-5 h-5" />
                  <span className="font-medium hidden sm:inline">Camera</span>
                </button>
              )}

              {/* Upload button */}
              {onUpload && (
                <button
                  onClick={onUpload}
                  disabled={disablePhotoButtons}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 transition-all"
                  title={disablePhotoButtons ? "Save the lot first to add photos" : "Upload photos"}
                >
                  <Upload className="w-5 h-5" />
                  <span className="font-medium hidden sm:inline">Upload</span>
                </button>
              )}

              {/* AI Enrich button */}
              {onAIEnrich && (
                <button
                  onClick={onAIEnrich}
                  disabled={enriching || !isOnline}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  title={!isOnline ? "AI features require internet connection" : "AI enrich data"}
                >
                  {enriching ? (
                    <div className="animate-spin">
                      <Sparkles className="w-5 h-5" />
                    </div>
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  <span className="font-medium hidden sm:inline">
                    {enriching ? 'Enriching...' : 'AI Enrich'}
                  </span>
                </button>
              )}

              {/* Save button */}
              {onSave && (
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all hover:shadow-lg"
                >
                  {saving ? (
                    <div className="animate-spin">
                      <Save className="w-5 h-5" />
                    </div>
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  <span className="font-medium">
                    {saving ? 'Saving...' : 'Save'}
                  </span>
                </button>
              )}
            </div>
          </div>
          
          {/* Helper text when photo buttons are disabled */}
          {disablePhotoButtons && (
            <div className="pb-2 text-center border-t border-gray-100 pt-2">
              <p className="text-xs text-gray-500 italic">
                💡 Save the lot first before adding photos
              </p>
            </div>
          )}
        </div>
      </footer>
    );
  }

  // Default: no footer
  return null;
}