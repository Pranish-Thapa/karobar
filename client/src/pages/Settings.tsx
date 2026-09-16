import { useState, useEffect } from 'react';
import { Store, Smartphone, Laptop, Trash2, QrCode, RefreshCw, Sun, Moon, Globe } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../context/DarkModeContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { dark, toggle } = useDarkMode();
  const { lang, setLanguage, t } = useI18n();
  const { toast } = useToast();
  const [shopName, setShopName] = useState(user?.shopName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExpiry, setQrExpiry] = useState('');
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  useEffect(() => { api.devices.list().then(setDevices).finally(() => setDevicesLoading(false)); }, []);

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMessage('');
    try {
      await api.settings.updateShop(shopName);
      updateUser({ shopName });
      toast('success', t.success + '!');
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const generateQR = async () => {
    setQrLoading(true);
    try {
      const res = await api.qr.generate();
      setQrImage(res.qr);
      setQrExpiry(res.expiresAt);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setQrLoading(false);
    }
  };

  const disconnectDevice = async (deviceId: string) => {
    if (!confirm(t.disconnect + '?')) return;
    setDisconnectingId(deviceId);
    try {
      await api.devices.remove(deviceId);
      const updated = await api.devices.list();
      setDevices(updated);
      toast('success', t.success);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="pb-20 lg:pb-0 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t.settings}</h1>

      {/* Shop Settings */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4"><Store className="w-5 h-5" /> {t.shopSettings}</h2>
        <form onSubmit={handleSaveShop} className="space-y-4">
          <div><label className="label">{t.shopName}</label><input type="text" value={shopName} onChange={e => setShopName(e.target.value)} className="input" required /></div>
          {message && <p className="text-sm text-primary-600">{message}</p>}
          <button type="submit" disabled={saving} className="btn-primary">{saving ? t.loading : t.saveChanges}</button>
        </form>
      </div>

      {/* Language & Theme */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4"><Globe className="w-5 h-5" /> {t.language}</h2>
        <div className="space-y-3">
          <button onClick={() => setLanguage('en')} className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${lang === 'en' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <span className="text-gray-900 dark:text-white font-medium">{t.english}</span>
            {lang === 'en' && <span className="w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center"><span className="w-2 h-2 bg-white rounded-full"></span></span>}
          </button>
          <button onClick={() => setLanguage('ne')} className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${lang === 'ne' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <span className="text-gray-900 dark:text-white font-medium">{t.nepali}</span>
            {lang === 'ne' && <span className="w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center"><span className="w-2 h-2 bg-white rounded-full"></span></span>}
          </button>
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
            <button onClick={toggle} className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <span className="text-gray-900 dark:text-white font-medium flex items-center gap-2">{dark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />} Dark Mode</span>
              <div className={`w-11 h-6 rounded-full transition-colors relative ${dark ? 'bg-primary-600' : 'bg-gray-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${dark ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* QR Device Connection */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4"><QrCode className="w-5 h-5" /> {t.connectMobile}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t.connectDesc}</p>
        <div className="text-center mb-4">
          {qrImage ? (
            <div>
              <img src={qrImage} alt="QR Code" className="w-48 h-48 mx-auto border rounded-lg dark:border-gray-600" />
              <p className="text-xs text-gray-400 mt-2">Expires: {new Date(qrExpiry).toLocaleTimeString()}</p>
              <button onClick={generateQR} disabled={qrLoading} className="btn-secondary mt-3 text-sm flex items-center gap-2 mx-auto"><RefreshCw className="w-3 h-3" /> {qrLoading ? t.generating : t.generateNewQR}</button>
            </div>
          ) : (
            <button onClick={generateQR} disabled={qrLoading} className="btn-primary flex items-center gap-2 mx-auto"><QrCode className="w-4 h-4" /> {qrLoading ? t.generating : t.generateQR}</button>
          )}
        </div>
      </div>

      {/* Connected Devices */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">{t.connectedDevices}</h2>
        {devicesLoading ? <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
        : devices.length === 0 ? <p className="text-gray-400 text-center py-4 text-sm">{t.noConnectedDevices}</p>
        : <div className="space-y-3">{devices.map(device => (
          <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              {device.device_type === 'mobile' ? <Smartphone className="w-5 h-5 text-gray-500" /> : <Laptop className="w-5 h-5 text-gray-500" />}
              <div><p className="font-medium text-gray-900 dark:text-white text-sm">{device.device_name}</p><p className="text-xs text-gray-400">Last active: {new Date(device.last_active).toLocaleDateString()}</p></div>
            </div>
            <button onClick={() => disconnectDevice(device.id)} disabled={disconnectingId === device.id} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {disconnectingId === device.id ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        ))}</div>}
      </div>
    </div>
  );
}