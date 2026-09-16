import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, DollarSign, Package, CheckCircle, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';
import { formatRelative } from '../lib/utils';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';

const iconMap: Record<string, any> = {
  low_stock: AlertTriangle,
  sale: CheckCircle,
  order: Package,
  payment: DollarSign,
};

const colorMap: Record<string, string> = {
  low_stock: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  sale: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  order: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  payment: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function Notifications() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await api.notifications.list();
      setNotifications(data);
    } catch (err: any) {
      toast('error', err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotifications(); }, []);

  const markRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      loadNotifications();
    } catch (err: any) {
      toast('error', err.message || 'Failed to mark as read');
    }
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      loadNotifications();
    } catch (err: any) {
      toast('error', err.message || 'Failed to mark all as read');
    }
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.notifications}</h1>
          {unread > 0 && <p className="text-gray-500 dark:text-gray-400 text-sm">{unread} {t.unread}</p>}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary flex items-center gap-2 text-sm">
            <CheckCheck className="w-4 h-4" /> {t.markAllRead}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">{t.noNotifications}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">{t.allCaughtUp}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = iconMap[n.type] || Bell;
            const color = colorMap[n.type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
            return (
              <div key={n.id} className={`card flex items-start gap-3 ${!n.read ? 'border-primary-200 bg-primary-50/30 dark:border-primary-800 dark:bg-primary-900/10' : ''}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{n.title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatRelative(n.created_at)}</p>
                </div>
                {!n.read && (
                  <button onClick={() => markRead(n.id)} className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 whitespace-nowrap">
                    {t.markRead}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
