import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, BarChart3, Award, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProfitLoss() {
  const [period, setPeriod] = useState('30days');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.profitLoss.get({ period }).then(setData).finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  if (!data) return <div className="text-center py-12 text-gray-500">Failed to load data</div>;

  const { summary, mostProfitableSale, profitableProducts, topDuesCustomers } = data;

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit & Loss</h1>
          <p className="text-gray-500 text-sm">Analyze your business performance</p>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="input w-auto">
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="90days">Last 90 Days</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">Total Revenue</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_revenue)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-5 h-5 text-orange-600" />
            <span className="text-sm text-gray-500">Total Cost</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.total_cost)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-primary-600" />
            <span className="text-sm text-gray-500">Gross Profit</span>
          </div>
          <p className="text-xl font-bold text-primary-600">{formatCurrency(summary.total_profit)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">Avg Profit/Sale</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(summary.avg_profit)}</p>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Sales Revenue</span>
            <span className="font-semibold text-gray-900">{formatCurrency(summary.total_revenue)}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Actual Cost</span>
            <span className="font-semibold text-gray-900">{formatCurrency(summary.total_cost)}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-primary-50 rounded-lg">
            <span className="text-primary-700 font-medium">Gross Profit</span>
            <span className="font-bold text-primary-700">{formatCurrency(summary.total_profit)}</span>
          </div>
          <div className="border-t pt-3 mt-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Money Received</span>
              <span className="font-semibold text-green-600">{formatCurrency(summary.amount_received)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg mt-2">
              <span className="text-gray-600">Customer Dues (Receivable)</span>
              <span className="font-semibold text-red-600">{formatCurrency(summary.outstanding_dues)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Most Profitable Sale */}
        {mostProfitableSale && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              Most Profitable Sale
            </h2>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-900">{mostProfitableSale.customer_name || 'Walk-in Customer'}</p>
                  <p className="text-sm text-gray-500">{formatDate(mostProfitableSale.sale_date)}</p>
                </div>
                <span className="badge badge-success">{formatCurrency(mostProfitableSale.profit)} profit</span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{mostProfitableSale.items || 'No items'}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-400">Revenue</p>
                  <p className="font-medium">{formatCurrency(mostProfitableSale.total_amount)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Cost</p>
                  <p className="font-medium">{formatCurrency(mostProfitableSale.cost_amount)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Due Customers */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-red-500" />
            Outstanding Customer Dues
          </h2>
          {topDuesCustomers.length > 0 ? (
            <div className="space-y-2">
              {topDuesCustomers.map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-red-700 text-sm font-medium">{c.name.charAt(0)}</span>
                    </div>
                    <span className="font-medium text-gray-900">{c.name}</span>
                  </div>
                  <span className="font-semibold text-red-600">{formatCurrency(c.outstanding_dues)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">No outstanding dues</p>
          )}
        </div>
      </div>

      {/* Product Profitability */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Most Profitable Products</h2>
        {profitableProducts.length > 0 ? (
          <>
            <div className="h-64 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitableProducts.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`Rs. ${value.toLocaleString('en-IN')}`, 'Profit']} />
                  <Bar dataKey="profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {profitableProducts.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-sm text-gray-500">{p.units_sold} units sold</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-primary-600">{formatCurrency(p.profit)}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(p.profit / p.units_sold)}/unit</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-center py-8">No sales data yet</p>
        )}
      </div>
    </div>
  );
}
