import { useState, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Package, ShoppingCart, TrendingUp, Bell, Settings, Menu, X, Store, Sun, Moon, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../context/DarkModeContext';
import { useI18n } from '../context/I18nContext';

const navItems = [
  { path: '/', key: 'dashboard', icon: LayoutDashboard },
  { path: '/customers', key: 'customers', icon: Users },
  { path: '/inventory', key: 'inventory', icon: Package },
  { path: '/sales', key: 'sales', icon: ShoppingCart },
  { path: '/profit-loss', key: 'profitLoss', icon: TrendingUp },
  { path: '/notifications', key: 'notifications', icon: Bell },
  { path: '/settings', key: 'settings', icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { dark, toggle } = useDarkMode();
  const { t, lang, setLanguage } = useI18n();

  return (
    <div className="min-h-screen flex dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-white dark:bg-gray-800 lg:border-r lg:border-gray-200 dark:lg:border-gray-700">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Karobar</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.shopName || 'My Shop'}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${location.pathname === item.path ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
              <item.icon className="w-5 h-5" />
              {(t as any)[item.key]}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={toggle} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-1">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {dark ? 'Light' : 'Dark'}
            </button>
            <button onClick={() => setLanguage(lang === 'en' ? 'ne' : 'en')} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-1">
              <Globe className="w-4 h-4" />
              {lang === 'en' ? 'नेपाली' : 'English'}
            </button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <span className="text-primary-700 dark:text-primary-300 font-medium text-sm">{user?.name?.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full text-left text-sm text-gray-500 hover:text-red-600 transition-colors px-1">{t.logout}</button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 dark:text-white">Karobar</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setLanguage(lang === 'en' ? 'ne' : 'en')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300">
            {lang === 'en' ? 'नेपा' : 'EN'}
          </button>
          <button onClick={toggle} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {dark ? <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {sidebarOpen ? <X className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-800 shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white">Karobar</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user?.shopName}</p>
                </div>
              </div>
            </div>
            <nav className="space-y-1">
              {navItems.map(item => (
                <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${location.pathname === item.path ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                  <item.icon className="w-5 h-5" />
                  {(t as any)[item.key]}
                </Link>
              ))}
            </nav>
            <div className="absolute bottom-4 left-4 right-4">
              <button onClick={logout} className="w-full text-left text-sm text-gray-500 hover:text-red-600 px-3 py-2">{t.logout}</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-0 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.slice(0, 5).map(item => (
            <Link key={item.path} to={item.path} className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${location.pathname === item.path ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>
              <item.icon className="w-5 h-5" />
              <span>{(t as any)[item.key]?.split(' ')[0]}</span>
            </Link>
          ))}
          <Link to="/notifications" className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${location.pathname === '/notifications' || location.pathname === '/settings' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>
            <Settings className="w-5 h-5" />
            <span>{t.settings?.split(' ')[0]}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
