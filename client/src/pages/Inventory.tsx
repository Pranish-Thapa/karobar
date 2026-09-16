import { useState, useEffect } from 'react';
import { Search, Plus, Package, Edit, Trash2, X, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const emptyForm = { name: '', sku: '', category: 'General', actual_price: '', selling_price: '', stock: '', low_stock_threshold: '5', unit: 'pcs', description: '' };

export default function Inventory() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const loadProducts = () => {
    api.products.list(search).then(setProducts).finally(() => setLoading(false));
  };

  useEffect(() => { loadProducts(); }, [search]);
  useEffect(() => { api.categories.list().then(setCategories); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const data = {
      ...form,
      actual_price: parseFloat(form.actual_price) || 0,
      selling_price: parseFloat(form.selling_price) || 0,
      stock: parseInt(form.stock) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
    };
    try {
      if (editProduct) {
        await api.products.update(editProduct.id, data);
      } else {
        await api.products.create(data);
      }
      setShowModal(false);
      setEditProduct(null);
      setForm(emptyForm);
      loadProducts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    await api.products.delete(id);
    loadProducts();
  };

  const openEdit = (product: any) => {
    setEditProduct(product);
    setForm({
      name: product.name, sku: product.sku || '', category: product.category || 'General',
      actual_price: String(product.actual_price), selling_price: String(product.selling_price),
      stock: String(product.stock), low_stock_threshold: String(product.low_stock_threshold),
      unit: product.unit || 'pcs', description: product.description || '',
    });
    setShowModal(true);
  };

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm">{products.length} products</p>
        </div>
        <button onClick={() => { setEditProduct(null); setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="input pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Your inventory is empty</p>
          <p className="text-gray-400 text-sm mt-1">Add your first product to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(product => {
            const isLow = product.stock <= product.low_stock_threshold;
            const profit = product.selling_price - product.actual_price;
            return (
              <div key={product.id} className={`card ${isLow ? 'border-red-200 bg-red-50/30' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{product.name}</h3>
                      {isLow && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      <span className="badge badge-info text-xs">{product.category}</span>
                    </div>
                    {product.sku && <p className="text-xs text-gray-400 mb-2">SKU: {product.sku}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-400">Cost Price</p>
                        <p className="font-medium">{formatCurrency(product.actual_price)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Selling Price</p>
                        <p className="font-medium">{formatCurrency(product.selling_price)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Profit/Unit</p>
                        <p className="font-medium text-primary-600">{formatCurrency(profit)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Stock</p>
                        <p className={`font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{product.stock} {product.unit}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => openEdit(product)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(product.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editProduct ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => { setShowModal(false); setEditProduct(null); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Product Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU / Product ID</label>
                  <input type="text" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} className="input" placeholder="Optional" />
                </div>
                <div>
                  <label className="label">Category</label>
                  <input type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input" list="categories" />
                  <datalist id="categories">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Cost Price (Rs.) *</label>
                  <input type="number" value={form.actual_price} onChange={e => setForm({...form, actual_price: e.target.value})} className="input" min="0" step="0.01" required />
                </div>
                <div>
                  <label className="label">Selling Price (Rs.) *</label>
                  <input type="number" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} className="input" min="0" step="0.01" required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Stock Qty *</label>
                  <input type="number" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} className="input" min="0" required />
                </div>
                <div>
                  <label className="label">Low Stock At</label>
                  <input type="number" value={form.low_stock_threshold} onChange={e => setForm({...form, low_stock_threshold: e.target.value})} className="input" min="0" />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input type="text" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} className="input" placeholder="pcs, kg, L" />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input" rows={2} placeholder="Optional" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditProduct(null); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editProduct ? 'Update' : 'Add Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
