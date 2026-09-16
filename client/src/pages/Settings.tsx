import { useState, useEffect } from 'react';
import { Store, Smartphone, Laptop, Trash2, QrCode, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [shopName, setShopName] = useState(user?.shopName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // QR Code
  const [qrImage, setQrImage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExpiry, setQrExpiry] = useState('');

  // Devices
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);

  useEffect(() => {
    api.devices.list().then(setDevices).finally(() => setDevicesLoading(false));
  }, []);

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.settings.updateShop(shopName);
      updateUser({ shopName });
      setMessage('Shop name updated!');
    } catch (err: any) {
      setMessage(err.message);
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
      alert(err.message);
    } finally {
      setQrLoading(false);
    }
  };

  const disconnectDevice = async (deviceId: string) => {
    if (!confirm('Disconnect this device?')) return;
    await api.devices.remove(deviceId);
    api.devices.list().then(setDevices);
  };

  return (
    <div className="pb-20 lg:pb-0 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Shop Settings */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Store className="w-5 h-5" /> Shop Settings
        </h2>
        <form onSubmit={handleSaveShop} className="space-y-4">
          <div>
            <label className="label">Shop Name</label>
            <input type="text" value={shopName} onChange={e => setShopName(e.target.value)} className="input" required />
          </div>
          {message && <p className="text-sm text-primary-600">{message}</p>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* QR Device Connection */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <QrCode className="w-5 h-5" /> Connect Mobile
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Scan this QR code from your mobile to connect to the same account.
        </p>

        <div className="text-center mb-4">
          {qrImage ? (
            <div>
              <img src={qrImage} alt="QR Code" className="w-48 h-48 mx-auto border rounded-lg" />
              <p className="text-xs text-gray-400 mt-2">
                Expires: {new Date(qrExpiry).toLocaleTimeString()}
              </p>
              <p className="text-xs text-orange-500 mt-1">Open Karobar on mobile → Connect to Existing Account → Scan</p>
              <button onClick={generateQR} className="btn-secondary mt-3 text-sm flex items-center gap-2 mx-auto">
                <RefreshCw className="w-3 h-3" /> Generate New QR
              </button>
            </div>
          ) : (
            <button onClick={generateQR} disabled={qrLoading} className="btn-primary flex items-center gap-2 mx-auto">
              <QrCode className="w-4 h-4" />
              {qrLoading ? 'Generating...' : 'Generate QR Code'}
            </button>
          )}
        </div>
      </div>

      {/* Connected Devices */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          Connected Devices
        </h2>
        {devicesLoading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
        ) : devices.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">No connected devices</p>
        ) : (
          <div className="space-y-3">
            {devices.map(device => (
              <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  {device.device_type === 'mobile' ? (
                    <Smartphone className="w-5 h-5 text-gray-500" />
                  ) : (
                    <Laptop className="w-5 h-5 text-gray-500" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{device.device_name}</p>
                    <p className="text-xs text-gray-400">
                      Last active: {new Date(device.last_active).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button onClick={() => disconnectDevice(device.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
