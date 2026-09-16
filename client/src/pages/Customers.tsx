import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Phone, MapPin, Trash2, Edit, Users } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination from '../components/Pagination';

export default function Customers() {
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    api.customers.list(debouncedSearch || undefined, page, 20)
      .then(res => { setCustomers(res.data); setTotal(res.total); })
      .catch(() => toast('error', 'Failed to load customers'))
      .finally(() => setLoading(false));
  }, [debouncedSearch, page]);

  const openAdd = () => { setEditCustomer(null); setForm({ name: '', phone: '', address: '', notes: '' }); setFormOpen(true); };
  const openEdit = (c: any) => { setEditCustomer(c); setForm({ name: c.name, phone: c.phone || '', address: c.address || '', notes: c.notes || '' }); setFormOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast('error', t.nameRequired);
    setSaving(true);
    try {
      if (editCustomer) {
        await api.customers.update(editCustomer.id, form);
        toast('success', 'Customer updated');
      } else {
        await api.customers.create(form);
        toast('success', 'Customer added');
      }
      setFormOpen(false);
      const res = await api.customers.list(debouncedSearch || undefined, page, 20);
      setCustomers(res.data); setTotal(res.total);
    } catch (err: any) { toast('error', err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.customers.delete(deleteTarget.id);
      toast('success', 'Customer deleted');
      setDeleteTarget(null);
      const res = await api.customers.list(debouncedSearch || undefined, page, 20);
      setCustomers(res.data); setTotal(res.total);
    } catch (err: any) { toast('error', err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.customers}</h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t.addCustomer}</button>
      </div>

      <div className="relative mb-4">
        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder={t.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} className="input pl-10" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">{t.loading}</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-2">{t.noCustomersYet}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{t.addFirstCustomer}</p>
          <button onClick={openAdd} className="btn-primary">{t.addCustomer}</button>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {customers.map(c => (
              <div key={c.id} className="card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/customers/${c.id}`)}>
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 dark:text-primary-300 font-medium">{c.name?.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                  <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(c.total_purchases)}</p>
                  {c.outstanding_dues > 0 && <p className="text-xs text-red-600 dark:text-red-400">{t.outstanding}: {formatCurrency(c.outstanding_dues)}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Edit className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => setDeleteTarget(c)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} total={total} limit={20} onChange={setPage} />
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{editCustomer ? t.editCustomer : t.addCustomer}</h2>
            <div className="space-y-3">
              <div><label className="label">{t.customerName} *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">{t.phoneNumber}</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">{t.address}</label><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div><label className="label">{t.notes}</label><input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setFormOpen(false)} className="btn-secondary flex-1">{t.cancel}</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? t.loading : t.save}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title={t.deleteCustomer} message={t.deleteConfirm} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
