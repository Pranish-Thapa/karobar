import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Phone, MapPin, User, X } from 'lucide-react';
import { api } from '../lib/api';

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [error, setError] = useState('');

  const loadCustomers = () => {
    api.customers.list(search).then(setCustomers).finally(() => setLoading(false));
  };

  useEffect(() => { loadCustomers(); }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editCustomer) {
        await api.customers.update(editCustomer.id, form);
      } else {
        await api.customers.create(form);
      }
      setShowModal(false);
      setEditCustomer(null);
      setForm({ name: '', phone: '', address: '', notes: '' });
      loadCustomers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer? This cannot be undone.')) return;
    await api.customers.delete(id);
    loadCustomers();
  };

  const openEdit = (customer: any) => {
    setEditCustomer(customer);
    setForm({ name: customer.name, phone: customer.phone || '', address: customer.address || '', notes: customer.notes || '' });
    setShowModal(true);
  };

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm">{customers.length} customers</p>
        </div>
        <button onClick={() => { setEditCustomer(null); setForm({ name: '', phone: '', address: '', notes: '' }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="input pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No customers yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your first customer to start tracking purchases and dues</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map(customer => (
            <Link key={customer.id} to={`/customers/${customer.id}`} className="card block hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-semibold">{customer.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                    {customer.phone && <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</p>}
                  </div>
                </div>
                <div className="text-right">
                  {customer.outstanding_dues > 0 ? (
                    <span className="badge badge-danger">{formatCurrency(customer.outstanding_dues)} due</span>
                  ) : (
                    <span className="badge badge-success">No dues</span>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Purchases</p>
                  <p className="font-medium text-gray-900">{formatCurrency(customer.total_purchases)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Paid</p>
                  <p className="font-medium text-gray-900">{formatCurrency(customer.total_paid)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Outstanding</p>
                  <p className={`font-medium ${customer.outstanding_dues > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(customer.outstanding_dues)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">{editCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={() => { setShowModal(false); setEditCustomer(null); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {error && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Customer Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" placeholder="Enter name" required />
              </div>
              <div>
                <label className="label">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input" placeholder="Enter phone" />
              </div>
              <div>
                <label className="label">Address</label>
                <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input" placeholder="Enter address (optional)" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} placeholder="Any notes (optional)" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditCustomer(null); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editCustomer ? 'Update' : 'Add Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
