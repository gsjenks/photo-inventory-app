import { useFooter } from '../context/FooterContext';
import { Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConnectivityService from '../services/ConnectivityService';

export default function ContextFooter() {
  const { actions } = useFooter();
  const [isOnline, setIsOnline] = useState(ConnectivityService.getConnectionStatus());

  useEffect(() => {
    const unsubscribe = ConnectivityService.onStatusChange((online: boolean) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  const getButtonClasses = (variant?: string) => {
    const base = 'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed';
    
    switch (variant) {
      case 'primary':
        return `${base} bg-indigo-600 text-white hover:bg-indigo-700`;
      case 'secondary':
        return `${base} bg-gray-100 text-gray-700 hover:bg-gray-200`;
      case 'ai':
        return `${base} bg-indigo-100 text-indigo-700 hover:bg-indigo-200`;
      case 'danger':
        return `${base} bg-red-600 text-white hover:bg-red-700`;
      default:
        return `${base} bg-white text-gray-700 border border-gray-300 hover:bg-gray-50`;
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 pb-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Connection Status */}
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

          {/* Action Buttons */}
          {actions.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled || action.loading}
                  className={getButtonClasses(action.variant)}
                >
                  {action.loading ? (
                    <div className="animate-spin">{action.icon}</div>
                  ) : (
                    action.icon
                  )}
                  <span className="hidden sm:inline">{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}