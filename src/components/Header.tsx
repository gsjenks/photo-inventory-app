import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Building2, ChevronDown, LogOut, Settings } from 'lucide-react';
import SettingsModal from './SettingsModal';

interface HeaderProps {
  onSearchClick?: () => void;
}

// Add underscore to show it's intentionally unused
export default function Header({ onSearchClick: _onSearchClick }: HeaderProps) {
  const { user, currentCompany, companies, setCurrentCompany, signOut } = useApp();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-indigo-600">CatalogPro</h1>
            
            {currentCompany && companies.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowCompanyMenu(!showCompanyMenu)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Building2 className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900">{currentCompany.name}</span>
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                </button>

                {showCompanyMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowCompanyMenu(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] z-20">
                      {companies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => {
                            setCurrentCompany(company);
                            setShowCompanyMenu(false);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg transition-colors ${
                            company.id === currentCompany.id ? 'bg-indigo-50 text-indigo-600' : ''
                          }`}
                        >
                          {company.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            
            <div className="flex items-center gap-3 px-3 py-2 border-l border-gray-200">
              <span className="text-sm text-gray-600 hidden sm:inline">{user?.email}</span>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}