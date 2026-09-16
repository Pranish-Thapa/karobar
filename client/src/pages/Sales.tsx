import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, ShoppingCart, Clock, CheckCircle, X, Filter, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';
import Pagination from '../components/Pagination';

const PAGE_LIMIT = 10;

export default function Sales() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [tab, setTab] = useState<'sales' | 'upcoming'>('sales');
  const [sales, setSales] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalSales, setTotalSales] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showNewSale, setShowNewSale] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [returnSaleId, setReturnSaleId] = useState('');
  const [returnProductId, setReturnProductId] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [completingOrder, setCompletingOrder] = useState<string | null>(null);
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleItems, setSaleItems] = useState<{ product_id: string; quantity: number; }[]>([]);
  const [salePaid, setSalePaid] = useState('');
  const [saleError, setSaleError] = useState('');
  const [saleSuccess, setSaleSuccess] = useState<any>(null);
  const [orderCustomerId, setOrderCustomerId] = useState('');
  const [orderItems, setOrderItems] = useState<{ product_id: string; quantity: number; }[]>([]);
  const [orderPaid, setOrderPaid] = useState('');
  const [orderExpectedDate, setOrderExpectedDate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderError, setOrderError] = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  }, []);

  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, c, p] = await Promise.all([
        api.sales.list({ search: debouncedSearch, from: dateFrom || undefined, to: dateTo || undefined, page, limit: PAGE_LIMIT }),
        api.orders.list(),
        api.customers.list(),
        api.products.list(),
      ]);
      setSales(s.data || []);
      setTotalSales(s.total || 0);
      setOrders(o.data || o || []);
      setCustomers(c.data || c || []);
      setProducts(p.data || p || []);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, dateFrom, dateTo, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const addSaleItem = () => setSaleItems([...saleItems, { product_id: '', quantity: 1 }]);
  const removeSaleItem = (i: number) => setSaleItems(saleItems.filter((_, idx) => idx !== i));
  const updateSaleItem = (i: number, field: string, value: any) => { setSaleItems(saleItems.map((item, idx) => idx === i ? { ...item, [field]: field === 'quantity' ? parseInt(value) || 1 : value } : item)); };
  const addOrderItem = () => setOrderItems([...orderItems, { product_id: '', quantity: 1 }]);
  const removeOrderItem = (i: number) => setOrderItems(orderItems.filter((_, idx) => idx !== i));
  const updateOrderItem = (i: number, field: string, value: any) => { setOrderItems(orderItems.map((item, idx) => idx === i ? { ...item, [field]: field === 'quantity' ? parseInt(value) || 1 : value } : item)); };
  const getSaleTotal = () => saleItems.reduce((sum, item) => { const product = products.find(p => p.id === item.product_id); return sum + (product ? product.selling_price * item.quantity : 0); }, 0);

  const handleNewSale = async (e: React.FormEvent) => {
    e.preventDefault(); setSaleError('');
    if (saleItems.length === 0 || !saleItems.some(i => i.product_id)) { setSaleError(t.addAtLeastOne); return; }
    setSubmittingSale(true);
    try {
      const result = await api.sales.create({ customer_id: saleCustomerId || undefined, items: saleItems.filter(i => i.product_id), amount_paid: parseFloat(salePaid) || 0 });
      setSaleSuccess(result); setShowNewSale(false);
      setSaleCustomerId(''); setSaleItems([]); setSalePaid('');
      toast('success', t.saleCompleted);
      loadData();
    } catch (err: any) { setSaleError(err.message); } finally { setSubmittingSale(false); }
  };

  const handleNewOrder = async (e: React.FormEvent) => {
    e.preventDefault(); setOrderError('');
    if (orderItems.length === 0 || !orderItems.some(i => i.product_id)) { setOrderError(t.addAtLeastOne); return; }
    setSubmittingOrder(true);
    try {
      await api.orders.create({ customer_id: orderCustomerId || undefined, items: orderItems.filter(i => i.product_id), amount_paid: parseFloat(orderPaid) || 0, expected_date: orderExpectedDate || undefined, notes: orderNotes || undefined });
      setShowNewOrder(false);
      setOrderCustomerId(''); setOrderItems([]); setOrderPaid(''); setOrderExpectedDate(''); setOrderNotes('');
      toast('success', t.createOrder + ' ' + t.success);
      loadData();
    } catch (err: any) { setOrderError(err.message); } finally { setSubmittingOrder(false); }
  };

  const completeOrder = async (orderId: string) => {
    setCompletingOrder(orderId);
    try { await api.orders.complete(orderId); toast('success', t.markCompleted + ' ' + t.success); loadData(); } catch (err: any) { toast('error', err.message); } finally { setCompletingOrder(null); }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReturn(true);
    try {
      await api.returns.create({ sale_id: returnSaleId, product_id: returnProductId, quantity: parseInt(returnQty), reason: returnReason });
      setShowReturn(false); setReturnSaleId(''); setReturnProductId(''); setReturnQty(''); setReturnReason('');
      toast('success', t.returnProcessed);
      loadData();
    } catch (err: any) { toast('error', err.message); } finally { setSubmittingReturn(false); }
  };

  const upcomingOrders = orders.filter(o => o.status === 'upcoming');

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.sales}</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowNewSale(true); setSaleItems([]); setSalePaid(''); setSaleCustomerId(''); setSaleError(''); setSaleSuccess(null); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t.newSale}</button>
          <button onClick={() => { setShowNewOrder(true); setOrderItems([]); setOrderPaid(''); setOrderCustomerId(''); setOrderError(''); }} className="btn-secondary flex items-center gap-2"><Clock className="w-4 h-4" /> {t.newOrder}</button>
          <button onClick={() => setShowReturn(true)} className="btn-secondary flex items-center gap-2"><RotateCcw className="w-4 h-4" /> {t.processReturn}</button>
        </div>
      </div>

      {saleSuccess && <div className="card bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 mb-6"><div className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5" /><div><p className="font-medium text-green-800 dark:text-green-300">{t.saleCompleted}</p><p className="text-sm text-green-700 dark:text-green-400 mt-1">{t.profit}: {formatCurrency(saleSuccess.profit)} | {t.due}: {formatCurrency(saleSuccess.due_amount)}</p><button onClick={() => setSaleSuccess(null)} className="text-sm text-green-600 underline mt-1">{t.cancel}</button></div></div></div>}

      {/* Filters */}
      <div className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" value={search} onChange={e => handleSearchChange(e.target.value)} placeholder={t.search + '...'} className="input pl-10" /></div>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300' : ''}`}><Filter className="w-4 h-4" /> {t.filterByDate}</button>
        </div>
        {showFilters && (
          <div className="flex gap-3 mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-1"><label className="label text-xs">{t.from}</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm" /></div>
            <div className="flex-1"><label className="label text-xs">{t.to}</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm" /></div>
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="self-end text-sm text-primary-600 hover:text-primary-700 whitespace-nowrap">{t.clearFilters}</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6">
        <button onClick={() => setTab('sales')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${tab === 'sales' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{t.completedSales} ({totalSales})</button>
        <button onClick={() => setTab('upcoming')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${tab === 'upcoming' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{t.upcomingOrdersTab} ({upcomingOrders.length})</button>
      </div>

      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      : tab === 'sales' ? (
        sales.length === 0 ? <div className="text-center py-16"><ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">{t.noCompletedSales}</p></div>
        : <>
          <div className="space-y-3">{sales.map(sale => (<div key={sale.id} className="card"><div className="flex items-start justify-between mb-2"><div><p className="font-semibold text-gray-900 dark:text-white">{sale.customer_name || t.walkInCustomer}</p><p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(sale.sale_date)}</p></div><div className="text-right"><p className="font-bold text-gray-900 dark:text-white">{formatCurrency(sale.total_amount)}</p><p className="text-sm text-primary-600">+{formatCurrency(sale.profit)} {t.profit}</p></div></div><p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{sale.items || '-'}</p><div className="flex gap-4 text-sm"><span className="text-gray-500">{t.amountPaid}: <span className="text-green-600 font-medium">{formatCurrency(sale.amount_paid)}</span></span>{sale.due_amount > 0 && <span className="text-gray-500">{t.due}: <span className="text-red-600 font-medium">{formatCurrency(sale.due_amount)}</span></span>}</div></div>))}</div>
          <Pagination page={page} total={totalSales} limit={PAGE_LIMIT} onChange={setPage} />
        </>
      ) : (
        upcomingOrders.length === 0 ? <div className="text-center py-16"><Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">{t.noUpcomingOrders}</p></div>
        : <div className="space-y-3">{upcomingOrders.map(order => (<div key={order.id} className="card"><div className="flex items-start justify-between mb-2"><div><p className="font-semibold text-gray-900 dark:text-white">{order.customer_name || t.walkInCustomer}</p><p className="text-sm text-gray-500">{t.from}: {formatDate(order.order_date)}</p>{order.expected_date && <p className="text-sm text-gray-500">{t.expectedDate}: {formatDate(order.expected_date)}</p>}</div><p className="font-bold text-gray-900 dark:text-white">{formatCurrency(order.total_amount)}</p></div><p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{order.items || '-'}</p><button onClick={() => completeOrder(order.id)} disabled={completingOrder === order.id} className="btn-primary text-sm w-full sm:w-auto"><CheckCircle className="w-4 h-4 inline mr-1" /> {completingOrder === order.id ? t.loading : t.markCompleted}</button></div>))}</div>
      )}

      {/* New Sale Modal */}
      {showNewSale && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-800"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.newSale}</h2><button onClick={() => setShowNewSale(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button></div>
        {saleError && <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{saleError}</div>}
        <form onSubmit={handleNewSale} className="p-4 space-y-4">
          <div><label className="label">{t.selectCustomer} ({t.optional})</label><select value={saleCustomerId} onChange={e => setSaleCustomerId(e.target.value)} className="input"><option value="">{t.walkInCustomer}</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><div className="flex items-center justify-between mb-2"><label className="label mb-0">{t.inventory}</label><button type="button" onClick={addSaleItem} className="text-sm text-primary-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> {t.addProduct}</button></div>{saleItems.length === 0 && <p className="text-sm text-gray-400">{t.addAtLeastOne}</p>}{saleItems.map((item, i) => { const product = products.find(p => p.id === item.product_id); return (<div key={i} className="flex gap-2 mb-2"><select value={item.product_id} onChange={e => updateSaleItem(i, 'product_id', e.target.value)} className="input flex-1"><option value="">{t.selectProduct}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} {t.stock})</option>)}</select><input type="number" value={item.quantity} onChange={e => updateSaleItem(i, 'quantity', e.target.value)} className="input w-20" min="1" />{product && <span className="text-sm text-gray-500 self-center whitespace-nowrap">{formatCurrency(product.selling_price * item.quantity)}</span>}<button type="button" onClick={() => removeSaleItem(i)} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button></div>); })}</div>
          {saleItems.length > 0 && <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><div className="flex justify-between text-sm"><span className="text-gray-500">{t.total}</span><span className="font-bold text-lg text-gray-900 dark:text-white">{formatCurrency(getSaleTotal())}</span></div></div>}
          <div><label className="label">{t.amountPaid}</label><input type="number" value={salePaid} onChange={e => setSalePaid(e.target.value)} className="input" min="0" step="0.01" placeholder="0" />{saleCustomerId && parseFloat(salePaid) < getSaleTotal() && parseFloat(salePaid) > 0 && <p className="text-xs text-orange-600 mt-1">{t.due}: {formatCurrency(getSaleTotal() - parseFloat(salePaid))}</p>}</div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowNewSale(false)} className="btn-secondary flex-1">{t.cancel}</button><button type="submit" disabled={submittingSale} className="btn-primary flex-1">{submittingSale ? t.loading : t.completeSale}</button></div>
        </form>
      </div></div>}

      {/* New Order Modal */}
      {showNewOrder && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-800"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.newOrder}</h2><button onClick={() => setShowNewOrder(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button></div>
        {orderError && <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{orderError}</div>}
        <form onSubmit={handleNewOrder} className="p-4 space-y-4">
          <div><label className="label">{t.selectCustomer}</label><select value={orderCustomerId} onChange={e => setOrderCustomerId(e.target.value)} className="input"><option value="">{t.selectCustomer}</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><div className="flex items-center justify-between mb-2"><label className="label mb-0">{t.inventory}</label><button type="button" onClick={addOrderItem} className="text-sm text-primary-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> {t.addProduct}</button></div>{orderItems.length === 0 && <p className="text-sm text-gray-400">{t.addAtLeastOne}</p>}{orderItems.map((item, i) => { const product = products.find(p => p.id === item.product_id); return (<div key={i} className="flex gap-2 mb-2"><select value={item.product_id} onChange={e => updateOrderItem(i, 'product_id', e.target.value)} className="input flex-1"><option value="">{t.selectProduct}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input type="number" value={item.quantity} onChange={e => updateOrderItem(i, 'quantity', e.target.value)} className="input w-20" min="1" />{product && <span className="text-sm text-gray-500 self-center whitespace-nowrap">{formatCurrency(product.selling_price * item.quantity)}</span>}<button type="button" onClick={() => removeOrderItem(i)} className="p-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button></div>); })}</div>
          <div className="grid grid-cols-2 gap-4"><div><label className="label">{t.amountPaid}</label><input type="number" value={orderPaid} onChange={e => setOrderPaid(e.target.value)} className="input" min="0" step="0.01" placeholder="0" /></div><div><label className="label">{t.expectedDate}</label><input type="date" value={orderExpectedDate} onChange={e => setOrderExpectedDate(e.target.value)} className="input" /></div></div>
          <div><label className="label">{t.notes}</label><textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} className="input" rows={2} placeholder={t.optional} /></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={() => setShowNewOrder(false)} className="btn-secondary flex-1">{t.cancel}</button><button type="submit" disabled={submittingOrder} className="btn-primary flex-1">{submittingOrder ? t.loading : t.createOrder}</button></div>
        </form>
      </div></div>}

      {/* Return Modal */}
      {showReturn && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-600"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.processReturn}</h2><button onClick={() => setShowReturn(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button></div>
        <form onSubmit={handleReturn} className="p-4 space-y-4">
          <div><label className="label">{t.selectSale}</label><select value={returnSaleId} onChange={e => setReturnSaleId(e.target.value)} className="input" required><option value="">{t.selectSale}</option>{sales.map(s => <option key={s.id} value={s.id}>{formatDate(s.sale_date)} - {s.customer_name || t.walkInCustomer} - {formatCurrency(s.total_amount)}</option>)}</select></div>
          <div><label className="label">{t.selectProduct}</label><select value={returnProductId} onChange={e => setReturnProductId(e.target.value)} className="input" required><option value="">{t.selectProduct}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock} {t.stock})</option>)}</select></div>
          <div><label className="label">{t.quantity}</label><input type="number" value={returnQty} onChange={e => setReturnQty(e.target.value)} className="input" min="1" required /></div>
          <div><label className="label">{t.returnReason}</label><input type="text" value={returnReason} onChange={e => setReturnReason(e.target.value)} className="input" placeholder={t.optional} /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowReturn(false)} className="btn-secondary flex-1">{t.cancel}</button><button type="submit" disabled={submittingReturn} className="btn-primary flex-1">{submittingReturn ? t.loading : t.confirm}</button></div>
        </form>
      </div></div>}
    </div>
  );
}
