import { useState, useEffect } from 'react';
import { Search, Plus, ShoppingCart, Clock, CheckCircle, X, AlertTriangle, Package } from 'lucide-react';
import { api } from '../lib/api';

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Sales() {
  const [tab, setTab] = useState<'sales' | 'upcoming'>('sales');
  const [sales, setSales] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showNewSale, setShowNewSale] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [loading, setLoading] = useState(true);

  // New Sale Form
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleItems, setSaleItems] = useState<{ product_id: string; quantity: number; }[]>([]);
  const [salePaid, setSalePaid] = useState('');
  const [saleError, setSaleError] = useState('');
  const [saleSuccess, setSaleSuccess] = useState<any>(null);

  // New Order Form
  const [orderCustomerId, setOrderCustomerId] = useState('');
  const [orderItems, setOrderItems] = useState<{ product_id: string; quantity: number; }[]>([]);
  const [orderPaid, setOrderPaid] = useState('');
  const [orderExpectedDate, setOrderExpectedDate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderError, setOrderError] = useState('');

  const loadData = () => {
    Promise.all([
      api.sales.list(),
      api.orders.list(),
      api.customers.list(),
      api.products.list(),
    ]).then(([s, o, c, p]) => {
      setSales(s);
      setOrders(o);
      setCustomers(c);
      setProducts(p);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const addSaleItem = () => setSaleItems([...saleItems, { product_id: '', quantity: 1 }]);
  const removeSaleItem = (i: number) => setSaleItems(saleItems.filter((_, idx) => idx !== i));
  const updateSaleItem = (i: number, field: string, value: any) => {
    const items = [...saleItems];
    (items[i] as any)[field] = field === 'quantity' ? parseInt(value) || 1 : value;
    setSaleItems(items);
  };

  const addOrderItem = () => setOrderItems([...orderItems, { product_id: '', quantity: 1 }]);
  const removeOrderItem = (i: number) => setOrderItems(orderItems.filter((_, idx) => idx !== i));
  const updateOrderItem = (i: number, field: string, value: any) => {
    const items = [...orderItems];
    (items[i] as any)[field] = field === 'quantity' ? parseInt(value) || 1 : value;
    setOrderItems(items);
  };

  const getSaleTotal = () => {
    return saleItems.reduce((sum, item) => {
      const product = products.find(p => p.id === item.product_id);
      return sum + (product ? product.selling_price * item.quantity : 0);
    }, 0);
  };

  const handleNewSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaleError('');
    if (saleItems.length === 0 || !saleItems.some(i => i.product_id)) {
      setSaleError('Add at least one product');
      return;
    }
    try {
      const result = await api.sales.create({
        customer_id: saleCustomerId || undefined,
        items: saleItems.filter(i => i.product_id),
        amount_paid: parseFloat(salePaid) || 0,
      });
      setSaleSuccess(result);
      setShowNewSale(false);
      setSaleCustomerId('');
      setSaleItems([]);
      setSalePaid('');
      loadData();
    } catch (err: any) {
      setSaleError(err.message);
    }
  };

  const handleNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError('');
    if (orderItems.length === 0 || !orderItems.some(i => i.product_id)) {
      setOrderError('Add at least one product');
      return;
    }
    try {
      await api.orders.create({
        customer_id: orderCustomerId || undefined,
        items: orderItems.filter(i => i.product_id),
        amount_paid: parseFloat(orderPaid) || 0,
        expected_date: orderExpectedDate || undefined,
        notes: orderNotes || undefined,
      });
      setShowNewOrder(false);
      setOrderCustomerId('');
      setOrderItems([]);
      setOrderPaid('');
      setOrderExpectedDate('');
      setOrderNotes('');
      loadData();
    } catch (err: any) {
      setOrderError(err.message);
    }
  };

  const completeOrder = async (orderId: string) => {
    if (!confirm('Complete this order? Stock will be deducted.')) return;
    try {
      await api.orders.complete(orderId);
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const upcomingOrders = orders.filter(o => o.status === 'upcoming');

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sales & Orders</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowNewSale(true); setSaleItems([]); setSalePaid(''); setSaleCustomerId(''); setSaleError(''); setSaleSuccess(null); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Sale
          </button>
          <button onClick={() => { setShowNewOrder(true); setOrderItems([]); setOrderPaid(''); setOrderCustomerId(''); setOrderError(''); }} className="btn-secondary flex items-center gap-2">
            <Clock className="w-4 h-4" /> New Order
          </button>
        </div>
      </div>

      {/* Success Message */}
      {saleSuccess && (
        <div className="card bg-green-50 border-green-200 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Sale completed successfully!</p>
              <p className="text-sm text-green-700 mt-1">
                Profit: {formatCurrency(saleSuccess.profit)} | Due: {formatCurrency(saleSuccess.due_amount)}
              </p>
              <button onClick={() => setSaleSuccess(null)} className="text-sm text-green-600 underline mt-1">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        <button onClick={() => setTab('sales')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${tab === 'sales' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Completed Sales ({sales.length})
        </button>
        <button onClick={() => setTab('upcoming')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${tab === 'upcoming' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Upcoming Orders ({upcomingOrders.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : tab === 'sales' ? (
        sales.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No completed sales yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sales.map(sale => (
              <div key={sale.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{sale.customer_name || 'Walk-in Customer'}</p>
                    <p className="text-sm text-gray-500">{formatDate(sale.sale_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatCurrency(sale.total_amount)}</p>
                    <p className="text-sm text-primary-600">+{formatCurrency(sale.profit)} profit</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{sale.items || 'No items'}</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-500">Paid: <span className="text-green-600 font-medium">{formatCurrency(sale.amount_paid)}</span></span>
                  {sale.due_amount > 0 && <span className="text-gray-500">Due: <span className="text-red-600 font-medium">{formatCurrency(sale.due_amount)}</span></span>}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        upcomingOrders.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No upcoming orders</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingOrders.map(order => (
              <div key={order.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{order.customer_name || 'Walk-in Customer'}</p>
                    <p className="text-sm text-gray-500">Ordered: {formatDate(order.order_date)}</p>
                    {order.expected_date && <p className="text-sm text-gray-500">Expected: {formatDate(order.expected_date)}</p>}
                  </div>
                  <p className="font-bold text-gray-900">{formatCurrency(order.total_amount)}</p>
                </div>
                <p className="text-sm text-gray-600 mb-3">{order.items || 'No items'}</p>
                <button onClick={() => completeOrder(order.id)} className="btn-primary text-sm w-full sm:w-auto">
                  <CheckCircle className="w-4 h-4 inline mr-1" /> Mark as Completed
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* New Sale Modal */}
      {showNewSale && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">New Sale</h2>
              <button onClick={() => setShowNewSale(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {saleError && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{saleError}</div>}
            <form onSubmit={handleNewSale} className="p-4 space-y-4">
              <div>
                <label className="label">Customer (optional)</label>
                <select value={saleCustomerId} onChange={e => setSaleCustomerId(e.target.value)} className="input">
                  <option value="">Walk-in Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Products</label>
                  <button type="button" onClick={addSaleItem} className="text-sm text-primary-600 font-medium flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                {saleItems.length === 0 && <p className="text-sm text-gray-400">Click "Add" to add products</p>}
                {saleItems.map((item, i) => {
                  const product = products.find(p => p.id === item.product_id);
                  return (
                    <div key={i} className="flex gap-2 mb-2">
                      <select value={item.product_id} onChange={e => updateSaleItem(i, 'product_id', e.target.value)} className="input flex-1">
                        <option value="">Select product</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
                      </select>
                      <input type="number" value={item.quantity} onChange={e => updateSaleItem(i, 'quantity', e.target.value)} className="input w-20" min="1" />
                      {product && <span className="text-sm text-gray-500 self-center whitespace-nowrap">{formatCurrency(product.selling_price * item.quantity)}</span>}
                      <button type="button" onClick={() => removeSaleItem(i)} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>

              {saleItems.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Total</span>
                    <span className="font-bold text-lg">{formatCurrency(getSaleTotal())}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Amount Paid</label>
                <input type="number" value={salePaid} onChange={e => setSalePaid(e.target.value)} className="input" min="0" step="0.01" placeholder="0" />
                {saleCustomerId && parseFloat(salePaid) < getSaleTotal() && parseFloat(salePaid) > 0 && (
                  <p className="text-xs text-orange-600 mt-1">Due: {formatCurrency(getSaleTotal() - parseFloat(salePaid))}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewSale(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Complete Sale</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">New Order</h2>
              <button onClick={() => setShowNewOrder(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {orderError && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{orderError}</div>}
            <form onSubmit={handleNewOrder} className="p-4 space-y-4">
              <div>
                <label className="label">Customer (optional)</label>
                <select value={orderCustomerId} onChange={e => setOrderCustomerId(e.target.value)} className="input">
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Products</label>
                  <button type="button" onClick={addOrderItem} className="text-sm text-primary-600 font-medium flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                {orderItems.length === 0 && <p className="text-sm text-gray-400">Click "Add" to add products</p>}
                {orderItems.map((item, i) => {
                  const product = products.find(p => p.id === item.product_id);
                  return (
                    <div key={i} className="flex gap-2 mb-2">
                      <select value={item.product_id} onChange={e => updateOrderItem(i, 'product_id', e.target.value)} className="input flex-1">
                        <option value="">Select product</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" value={item.quantity} onChange={e => updateOrderItem(i, 'quantity', e.target.value)} className="input w-20" min="1" />
                      {product && <span className="text-sm text-gray-500 self-center whitespace-nowrap">{formatCurrency(product.selling_price * item.quantity)}</span>}
                      <button type="button" onClick={() => removeOrderItem(i)} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Amount Paid</label>
                  <input type="number" value={orderPaid} onChange={e => setOrderPaid(e.target.value)} className="input" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label className="label">Expected Date</label>
                  <input type="date" value={orderExpectedDate} onChange={e => setOrderExpectedDate(e.target.value)} className="input" />
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="input" rows={2} placeholder="Optional notes" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewOrder(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create Order</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
