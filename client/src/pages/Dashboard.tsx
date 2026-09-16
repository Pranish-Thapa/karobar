import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { formatCurrency, formatDate } from '../lib/utils';
import { useToast } from '../components/Toast';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d'>('7d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard.get().then(setData).catch(() => {
      toast('error', t.dashboard);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-500">{t.loading}</span>
      </div>
    );
  }

  if (!data) return <div className="text-center py-8 text-gray-500">{t.dashboard}</div>;

  const salesData = chartPeriod === '7d' ? data.salesLast7 : data.salesLast30;
  const profitData = chartPeriod === '7d' ? data.profitLast7 : data.profitLast30;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.goodMorning;
    if (hour < 17) return t.goodAfternoon;
    return t.goodEvening;
  };

  return (
    <div className="pb-20 lg:pb-0">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{greeting()} 👋</h1>
        <p className="text-gray-500 mt-1">{t.shopOverview}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t.todaysSales}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.todaySales)}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t.todaysProfit}</span>
          </div>
          <p className="text-2xl font-bold text-primary-600">{formatCurrency(data.todayProfit)}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-yellow-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t.pendingDues}</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{formatCurrency(data.pendingDues)}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t.inventoryValue}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.inventoryValue)}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t.lowStockItems}</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{data.lowStockCount}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-gray-500">{t.upcomingOrders}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.upcomingOrders}</p>
          {data.upcomingOrdersValue > 0 && (
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(data.upcomingOrdersValue)}</p>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t.salesOverview}</h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setChartPeriod('7d')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === '7d' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>7D</button>
              <button onClick={() => setChartPeriod('30d')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === '30d' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>30D</button>
            </div>
          </div>
          <div className="h-64">
            {salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`Rs. ${value.toLocaleString('en-IN')}`, 'Sales']} labelFormatter={label => new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} />
                  <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">{t.noSalesYet}</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t.profitOverview}</h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setChartPeriod('7d')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === '7d' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>7D</button>
              <button onClick={() => setChartPeriod('30d')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === '30d' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>30D</button>
            </div>
          </div>
          <div className="h-64">
            {profitData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profitData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`Rs. ${value.toLocaleString('en-IN')}`, 'Profit']} labelFormatter={label => new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} />
                  <Line type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} dot={{ fill: '#16a34a' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">{t.noSalesYet}</div>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock + Recent Sales */}
      <div className="grid lg:grid-cols-2 gap-6">
        {data.lowStockProducts.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                {t.lowStock}
              </h3>
              <Link to="/inventory" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                {t.viewAll} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {data.lowStockProducts.slice(0, 5).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-gray-500">Threshold: {p.low_stock_threshold}</p>
                  </div>
                  <span className="badge badge-danger">{p.stock} {t.remaining}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t.recentSales}</h3>
            <Link to="/sales" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              {t.viewAll} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {data.recentSales.length > 0 ? (
            <div className="space-y-3">
              {data.recentSales.map((sale: any) => (
                <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{sale.customer_name || 'Walk-in Customer'}</p>
                    <p className="text-xs text-gray-500">{sale.product_names || 'No items'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 text-sm">{formatCurrency(sale.total_amount)}</p>
                    <p className="text-xs text-primary-600">+{formatCurrency(sale.profit)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{t.noSalesYet}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
