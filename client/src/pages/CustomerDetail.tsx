import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MapPin, Edit, Trash2, DollarSign, ShoppingCart } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../context/I18nContext';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    if (id) {
      api.customers.get(id).then(setCustomer).catch((err) => {
        toast('error', err.message);
      }).finally(() => setLoading(false));
    }
  }, [id]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      setPaymentError(t.validAmountRequired);
      return;
    }
    if (amount > customer.outstanding_dues) {
      setPaymentError(t.paymentExceedsDue);
      return;
    }
    setPaymentLoading(true);
    try {
      await api.customers.addPayment(id!, { amount });
      const updated = await api.customers.get(id!);
      setCustomer(updated);
      setShowPayment(false);
      setPaymentAmount('');
      toast('success', t.success);
    } catch (err: any) {
      setPaymentError(err.message);
      toast('error', err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await api.customers.delete(id!);
      navigate('/customers');
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const openEdit = () => {
    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      notes: customer.notes || '',
    });
    setEditError('');
    setShowEdit(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editForm.name.trim()) {
      setEditError(t.nameRequired);
      return;
    }
    setEditLoading(true);
    try {
      const updated = await api.customers.update(id!, editForm);
      setCustomer(updated);
      setShowEdit(false);
      toast('success', t.success);
    } catch (err: any) {
      setEditError(err.message);
      toast('error', err.message);
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  if (!customer) {
    return <div className="text-center py-12 text-gray-500">{t.loading}</div>;
  }

  return (
    <div className="pb-20 lg:pb-0">
      <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> {t.customers}
      </button>

      {/* Customer Info */}
      <div className="card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-700 text-xl font-bold">{customer.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
              {customer.phone && <p className="text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</p>}
              {customer.address && <p className="text-gray-500 flex items-center gap-1 text-sm"><MapPin className="w-3 h-3" />{customer.address}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={openEdit} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              <Edit className="w-4 h-4" />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-gray-500">{t.totalPurchases}</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(customer.total_purchases)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">{t.totalPaid}</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(customer.total_paid)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">{t.outstanding}</p>
            <p className={`text-lg font-bold ${customer.outstanding_dues > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(customer.outstanding_dues)}</p>
          </div>
        </div>

        {customer.outstanding_dues > 0 && (
          <button onClick={() => setShowPayment(true)} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
            <DollarSign className="w-4 h-4" /> {t.recordPayment}
          </button>
        )}
      </div>

      {/* Payments */}
      {customer.payments?.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.recordPayment}</h2>
          <div className="space-y-3">
            {customer.payments.map((payment: any) => (
              <div key={payment.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{formatCurrency(payment.amount)}</p>
                  <p className="text-sm text-gray-500">{formatDateTime(payment.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.transactionHistory}</h2>
        {customer.transactions?.length > 0 ? (
          <div className="space-y-3">
            {customer.transactions.map((tx: any) => (
              <div key={tx.id} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-900">{formatDateTime(tx.sale_date)}</p>
                  <span className={`badge ${tx.due_amount > 0 ? 'badge-warning' : 'badge-success'}`}>
                    {tx.due_amount > 0 ? t.partial : t.noDues}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{tx.product_names || t.noItems}</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-gray-400">{t.total}</p>
                    <p className="font-medium">{formatCurrency(tx.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">{t.totalPaid}</p>
                    <p className="font-medium text-green-600">{formatCurrency(tx.amount_paid)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">{t.due}</p>
                    <p className={`font-medium ${tx.due_amount > 0 ? 'text-red-600' : 'text-gray-600'}`}>{formatCurrency(tx.due_amount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t.noTransactions}</p>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">{t.recordPayment}</h2>
              <p className="text-sm text-gray-500">{t.outstanding}: {formatCurrency(customer.outstanding_dues)}</p>
            </div>
            {paymentError && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{paymentError}</div>}
            <form onSubmit={handlePayment} className="p-4 space-y-4">
              <div>
                <label className="label">{t.paymentAmount}</label>
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="input text-lg" placeholder="0" min="0.01" step="0.01" max={customer.outstanding_dues} required />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowPayment(false); setPaymentError(''); }} className="btn-secondary flex-1" disabled={paymentLoading}>{t.cancel}</button>
                <button type="submit" className="btn-primary flex-1" disabled={paymentLoading}>{paymentLoading ? t.loading : t.recordPayment}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">{t.editCustomer}</h2>
            </div>
            {editError && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{editError}</div>}
            <form onSubmit={handleEdit} className="p-4 space-y-4">
              <div>
                <label className="label">{t.customerName}</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="input" required />
              </div>
              <div>
                <label className="label">{t.phoneNumber}</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">{t.address}</label>
                <input type="text" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">{t.notes}</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="input" rows={3} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowEdit(false); setEditError(''); }} className="btn-secondary flex-1" disabled={editLoading}>{t.cancel}</button>
                <button type="submit" className="btn-primary flex-1" disabled={editLoading}>{editLoading ? t.loading : t.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t.deleteCustomer}
        message={t.deleteConfirm}
        confirmLabel={deleteLoading ? t.loading : t.delete}
        cancelLabel={t.cancel}
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
