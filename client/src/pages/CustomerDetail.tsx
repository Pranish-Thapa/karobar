import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, MapPin, Edit, Trash2, DollarSign, ShoppingCart } from 'lucide-react';
import { api } from '../lib/api';

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    if (id) {
      api.customers.get(id).then(setCustomer).finally(() => setLoading(false));
    }
  }, [id]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }
    try {
      await api.customers.addPayment(id!, { amount });
      const updated = await api.customers.get(id!);
      setCustomer(updated);
      setShowPayment(false);
      setPaymentAmount('');
    } catch (err: any) {
      setPaymentError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this customer? This cannot be undone.')) return;
    await api.customers.delete(id!);
    navigate('/customers');
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  if (!customer) {
    return <div className="text-center py-12 text-gray-500">Customer not found</div>;
  }

  return (
    <div className="pb-20 lg:pb-0">
      <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
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
            <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Purchases</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(customer.total_purchases)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Paid</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(customer.total_paid)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Outstanding</p>
            <p className={`text-lg font-bold ${customer.outstanding_dues > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(customer.outstanding_dues)}</p>
          </div>
        </div>

        {customer.outstanding_dues > 0 && (
          <button onClick={() => setShowPayment(true)} className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
            <DollarSign className="w-4 h-4" /> Record Payment
          </button>
        )}
      </div>

      {/* Transaction History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h2>
        {customer.transactions?.length > 0 ? (
          <div className="space-y-3">
            {customer.transactions.map((tx: any) => (
              <div key={tx.id} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-900">{formatDate(tx.sale_date)}</p>
                  <span className={`badge ${tx.due_amount > 0 ? 'badge-warning' : 'badge-success'}`}>
                    {tx.due_amount > 0 ? 'Partial' : 'Paid'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{tx.product_names || 'No items'}</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-gray-400">Total</p>
                    <p className="font-medium">{formatCurrency(tx.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Paid</p>
                    <p className="font-medium text-green-600">{formatCurrency(tx.amount_paid)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Due</p>
                    <p className={`font-medium ${tx.due_amount > 0 ? 'text-red-600' : 'text-gray-600'}`}>{formatCurrency(tx.due_amount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No transactions yet</p>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Record Payment</h2>
              <p className="text-sm text-gray-500">Outstanding: {formatCurrency(customer.outstanding_dues)}</p>
            </div>
            {paymentError && <div className="mx-4 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{paymentError}</div>}
            <form onSubmit={handlePayment} className="p-4 space-y-4">
              <div>
                <label className="label">Payment Amount</label>
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="input text-lg" placeholder="0" min="0.01" step="0.01" max={customer.outstanding_dues} required />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowPayment(false); setPaymentError(''); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
