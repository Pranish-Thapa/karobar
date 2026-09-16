import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';
import { Store, Eye, EyeOff } from 'lucide-react';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password, shopName || undefined);
    } catch (err: any) {
      toast('error', err.message || t.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary-50 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Store className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Karobar</h1>
          <p className="text-gray-500 mt-1">Start managing your business</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{t.createAccount}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t.yourName}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Your name" required />
            </div>
            <div>
              <label className="label">{t.shopNameLabel}</label>
              <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} className="input" placeholder="My Shop" />
            </div>
            <div>
              <label className="label">{t.email}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder="your@email.com" required />
            </div>
            <div>
              <label className="label">{t.password}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input pr-10" placeholder="Min 6 characters" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? t.creatingAccount : t.createAccount}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {t.alreadyHaveAccount}{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">{t.signIn}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
