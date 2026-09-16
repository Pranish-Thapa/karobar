import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Package, Edit, Trash2, X, AlertTriangle, Upload, Download, ArrowUpDown } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, debounce } from '../lib/utils';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';
import Pagination from '../components/Pagination';
import ConfirmDialog from '../components/ConfirmDialog';
import UndoToast from '../components/UndoToast';

const PAGE_SIZE = 20;
const emptyForm = { name: '', sku: '', category: 'General', actual_price: '', selling_price: '', stock: '', low_stock_threshold: '5', unit: 'pcs', description: '' };

export default function Inventory() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [undoMsg, setUndoMsg] = useState('');
  const [undoFn, setUndoFn] = useState<(() => void) | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const debouncedSetSearch = useRef(debounce((val: string) => { setDebouncedSearch(val); }, 300)).current;

  useEffect(() => { debouncedSetSearch(search); }, [search]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const result = await api.products.list(debouncedSearch, undefined, page, PAGE_SIZE);
      setProducts(result.data);
      setTotal(result.total);
    } catch (err: any) {
      toast('error', err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadProducts(); }, [debouncedSearch, page]);
  useEffect(() => { api.categories.list().then(setCategories); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const data = { ...form, actual_price: parseFloat(form.actual_price) || 0, selling_price: parseFloat(form.selling_price) || 0, stock: parseInt(form.stock) || 0, low_stock_threshold: parseInt(form.low_stock_threshold) || 5 };
    try {
      setSubmitting(true);
      if (editProduct) { await api.products.update(editProduct.id, data); } else { await api.products.create(data); }
      setShowModal(false); setEditProduct(null); setForm(emptyForm);
      toast('success', editProduct ? 'Product updated' : 'Product added');
      loadProducts();
    } catch (err: any) {
      setError(err.message);
      toast('error', err.message || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => { setConfirmDelete({ id, name }); };
  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      const deleted = products.find(p => p.id === confirmDelete.id);
      await api.products.delete(confirmDelete.id);
      setConfirmDelete(null);
      loadProducts();
      toast('success', `"${deleted?.name}" deleted`);
      setUndoMsg(`"${deleted?.name}" deleted`);
      setUndoFn(() => async () => { if (deleted) { try { await api.products.create({ name: deleted.name, sku: deleted.sku, category: deleted.category, actual_price: deleted.actual_price, selling_price: deleted.selling_price, stock: deleted.stock, low_stock_threshold: deleted.low_stock_threshold, unit: deleted.unit, description: deleted.description }); loadProducts(); } catch (err: any) { toast('error', 'Failed to restore product'); } } });
    } catch (err: any) {
      toast('error', err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (product: any) => { setEditProduct(product); setForm({ name: product.name, sku: product.sku || '', category: product.category || 'General', actual_price: String(product.actual_price), selling_price: String(product.selling_price), stock: String(product.stock), low_stock_threshold: String(product.low_stock_threshold), unit: product.unit || 'pcs', description: product.description || '' }); setShowModal(true); };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { setCsvErrors([{ row: 0, reason: 'No data rows found' }]); return; }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['name'];
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length) { setCsvErrors([{ row: 0, reason: `Missing required columns: ${missing.join(', ')}` }]); return; }
    const data: any[] = [];
    const errors: { row: number; reason: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim());
      if (vals.length < headers.length) { errors.push({ row: i + 1, reason: 'Insufficient columns' }); continue; }
      const obj: any = {};
      headers.forEach((h, idx) => { obj[h] = vals[idx]; });
      if (!obj.name) { errors.push({ row: i + 1, reason: 'Name is required' }); continue; }
      const ap = parseFloat(obj.actual_price || obj.cost_price || '0');
      const sp = parseFloat(obj.selling_price || '0');
      if (ap < 0) { errors.push({ row: i + 1, reason: 'Cost price cannot be negative' }); continue; }
      if (sp < 0) { errors.push({ row: i + 1, reason: 'Selling price cannot be negative' }); continue; }
      const st = parseInt(obj.stock || '0');
      if (st < 0) { errors.push({ row: i + 1, reason: 'Stock cannot be negative' }); continue; }
      data.push({ name: obj.name, sku: obj.sku || '', category: obj.category || 'General', actual_price: ap, selling_price: sp, stock: st, low_stock_threshold: parseInt(obj.low_stock_threshold || '5'), unit: obj.unit || 'pcs', description: obj.description || '' });
    }
    setCsvData(data); setCsvErrors(errors);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const text = ev.target?.result as string; parseCSV(text); };
    reader.readAsText(file);
  };

  const doImport = async () => {
    try {
      setImporting(true);
      const result = await api.products.import(csvData);
      setImportResult(result); setCsvData([]); setCsvErrors([]);
      toast('success', `Imported ${result.imported} products`);
      loadProducts();
    } catch (err: any) {
      toast('error', err.message || 'Failed to import products');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'Name,SKU,Category,Cost Price,Selling Price,Stock,Low Stock Threshold,Unit,Description\nCoca-Cola 500ml,BEV001,Beverages,40,50,100,10,pcs,Chilled soda';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'karobar_template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const adj = parseInt(adjustAmount);
    if (!adj || adj === 0) return;
    try {
      setAdjusting(true);
      await api.inventory.adjust({ product_id: adjustProduct.id, adjustment: adj, reason: adjustReason || 'Manual adjustment' });
      setShowAdjust(false); setAdjustProduct(null); setAdjustAmount(''); setAdjustReason('');
      toast('success', 'Stock adjusted');
      loadProducts();
    } catch (err: any) {
      toast('error', err.message || 'Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.inventory}</h1><p className="text-gray-500 text-sm">{total} {t.inventory}</p></div>
        <div className="flex gap-2">
          <button onClick={() => { setEditProduct(null); setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t.addProduct}</button>
          <button onClick={() => { setShowImport(true); setCsvData([]); setCsvErrors([]); setImportResult(null); if (fileRef.current) fileRef.current.value = ''; }} className="btn-secondary flex items-center gap-2"><Upload className="w-4 h-4" /> {t.importCSV}</button>
        </div>
      </div>

      <div className="relative mb-6"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchProducts} className="input pl-10" /></div>

      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      : products.length === 0 ? <div className="text-center py-16"><Package className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">{t.inventoryEmpty}</p><p className="text-gray-400 text-sm mt-1">{t.addFirstProduct}</p></div>
      : <div className="space-y-3">{products.map(product => { const isLow = product.stock <= product.low_stock_threshold; const profit = product.selling_price - product.actual_price; return (
        <div key={product.id} className={`card ${isLow ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10' : ''}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1"><h3 className="font-semibold text-gray-900 dark:text-white">{product.name}</h3>{isLow && <AlertTriangle className="w-4 h-4 text-red-500" />}<span className="badge badge-info text-xs">{product.category}</span></div>
              {product.sku && <p className="text-xs text-gray-400 mb-2">SKU: {product.sku}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><p className="text-gray-400">{t.costPrice}</p><p className="font-medium">{formatCurrency(product.actual_price)}</p></div>
                <div><p className="text-gray-400">{t.sellingPrice}</p><p className="font-medium">{formatCurrency(product.selling_price)}</p></div>
                <div><p className="text-gray-400">{t.profitPerUnit}</p><p className="font-medium text-primary-600">{formatCurrency(profit)}</p></div>
                <div><p className="text-gray-400">{t.stock}</p><p className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{product.stock} {product.unit}</p></div>
              </div>
            </div>
            <div className="flex gap-1 ml-2">
              <button onClick={() => { setAdjustProduct(product); setAdjustAmount(''); setAdjustReason(''); setShowAdjust(true); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title={t.adjustStock}><ArrowUpDown className="w-4 h-4" /></button>
              <button onClick={() => openEdit(product)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"><Edit className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(product.id, product.name)} disabled={deleting} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>); })}</div>}

      {!loading && products.length > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />}

      {showModal && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-800"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editProduct ? t.editProduct : t.addProduct}</h2><button onClick={() => { setShowModal(false); setEditProduct(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button></div>
        {error && <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div><label className="label">{t.productName} *</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" required /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="label">{t.sku}</label><input type="text" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} className="input" placeholder={t.optional} /></div><div><label className="label">{t.category}</label><input type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input" list="categories" /><datalist id="categories">{categories.map(c => <option key={c} value={c} />)}</datalist></div></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="label">{t.costPrice} (Rs.) *</label><input type="number" value={form.actual_price} onChange={e => setForm({...form, actual_price: e.target.value})} className="input" min="0" step="0.01" required /></div><div><label className="label">{t.sellingPrice} (Rs.) *</label><input type="number" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} className="input" min="0" step="0.01" required /></div></div>
          <div className="grid grid-cols-3 gap-4"><div><label className="label">{t.stock} *</label><input type="number" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} className="input" min="0" required /></div><div><label className="label">{t.lowStockAt}</label><input type="number" value={form.low_stock_threshold} onChange={e => setForm({...form, low_stock_threshold: e.target.value})} className="input" min="0" /></div><div><label className="label">{t.unit}</label><input type="text" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="input" placeholder="pcs, kg, L" /></div></div>
          <div><label className="label">{t.description}</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input" rows={2} placeholder={t.optional} /></div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={() => { setShowModal(false); setEditProduct(null); }} className="btn-secondary flex-1">{t.cancel}</button><button type="submit" disabled={submitting} className="btn-primary flex-1">{submitting ? t.loading : editProduct ? t.save : t.addProduct}</button></div>
        </form>
      </div></div>}

      {showImport && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-800"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.importCSV}</h2><button onClick={() => setShowImport(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-4">
          <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 w-full"><Download className="w-4 h-4" /> {t.downloadTemplate}</button>
          <div><label className="label">{t.chooseFile}</label><input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="input" /></div>
          {importResult && <div className={`p-3 rounded-lg text-sm ${importResult.errors.length ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300' : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'}`}>
            {importResult.imported > 0 && <p>{t.importSuccess.replace('{count}', String(importResult.imported))}</p>}
            {importResult.errors.length > 0 && <p>{t.importErrors.replace('{count}', String(importResult.errors.length))}</p>}
          </div>}
          {(csvData.length > 0 || csvErrors.length > 0) && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t.importPreview}: {csvData.length} {t.validRows}, {csvErrors.length} {t.errorRows}</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {csvData.map((p, i) => <div key={i} className="text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded flex justify-between"><span>{p.name}</span><span>{formatCurrency(p.selling_price)}</span></div>)}
                {csvErrors.map((e, i) => <div key={i} className="text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-700 dark:text-red-300">Row {e.row}: {e.reason}</div>)}
              </div>
              {csvData.length > 0 && <button onClick={doImport} disabled={importing} className="btn-primary w-full mt-3">{importing ? t.loading : t.confirmImport} ({csvData.length})</button>}
            </div>
          )}
        </div>
      </div></div>}

      {showAdjust && adjustProduct && <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-600"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t.adjustStock}: {adjustProduct.name}</h2><button onClick={() => setShowAdjust(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button></div>
        <form onSubmit={handleAdjust} className="p-4 space-y-4">
          <p className="text-sm text-gray-500">{t.stock}: {adjustProduct.stock}</p>
          <div><label className="label">{t.adjust} ({t.addStock} positive, {t.removeStock} negative)</label><input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} className="input" required placeholder="+10 or -5" /></div>
          <div><label className="label">{t.adjustmentReason}</label><input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="input" placeholder={t.adjustmentReason} /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowAdjust(false)} className="btn-secondary flex-1">{t.cancel}</button><button type="submit" disabled={adjusting} className="btn-primary flex-1">{adjusting ? t.loading : t.adjust}</button></div>
        </form>
      </div></div>}

      <ConfirmDialog open={!!confirmDelete} title={t.deleteProduct} message={`${t.deleteProductConfirm} "${confirmDelete?.name}"`} confirmLabel={t.delete} danger onConfirm={doDelete} onCancel={() => setConfirmDelete(null)} />
      {undoMsg && <UndoToast message={undoMsg} onUndo={() => { undoFn?.(); setUndoMsg(''); setUndoFn(null); }} onDismiss={() => { setUndoMsg(''); setUndoFn(null); }} />}
    </div>
  );
}
