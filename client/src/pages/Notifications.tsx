import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, DollarSign, Package, CheckCircle, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const iconMap: Record<string, any> = {
  low_stock: AlertTriangle,
  sale: CheckCircle,
  order: Package,
  payment: DollarSign,
};

const colorMap: Record<string, string> = {
  low_stock: 'bg-red-100 text-red-600',
  sale: 'bg-green-100 text-green-600',
  order: 'bg-blue-100 text-blue-600',
  payment: 'bg-yellow-100 text-yellow-600',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = () => {
    api.notifications.list().then(setNotifications).finally(() => setLoading(false));
  };

  useEffect(() => { loadNotifications(); }, []);

  const markRead = async (id: string) => {
    await api.notifications.markRead(id);
    loadNotifications();
  };

  const markAllRead = async () => {
    await api.notifications.markAllRead();
    loadNotifications();
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unread > 0 && <p className="text-gray-500 text-sm">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary flex items-center gap-2 text-sm">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No notifications</p>
          <p className="text-gray-400 text-sm mt-1">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = iconMap[n.type] || Bell;
            const color = colorMap[n.type] || 'bg-gray-100 text-gray-600';
            return (
              <div key={n.id} className={`card flex items-start gap-3 ${!n.read ? 'border-primary-200 bg-primary-50/30' : ''}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{n.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {!n.read && (
                  <button onClick={() => markRead(n.id)} className="text-xs text-primary-600 hover:text-primary-700 whitespace-nowrap">
                    Mark read
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
