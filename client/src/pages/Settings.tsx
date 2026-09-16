import { useState, useEffect, useRef } from 'react';
import { Store, Smartphone, Laptop, Trash2, QrCode, RefreshCw, Sun, Moon, Globe, Download, Upload, Shield, Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../context/DarkModeContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const restoreFileRef = useRef<File | null>(null);
  const [billing, setBilling] = useState<any>({});
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingMessage, setBillingMessage] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  useEffect(() => {
    api.settings.getBilling().then(setBilling).catch(() => {}).finally(() => setBillingLoading(false));
  }, []);

  useEffect(() => {
    api.devices.list().then(setDevices).catch(() => {}).finally(() => setDevicesLoading(false));
    api.backup.check().then(res => setLastBackup(res.lastBackup)).catch(() => {});
  }, []);

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setMessage('');
    try {
      await api.settings.updateShop(shopName);
      updateUser({ shopName });
      setMessage(t.success + '!');
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

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);

  const handleDisconnectClick = (deviceId: string) => {
    setDisconnectTarget(deviceId);
    setShowDisconnectConfirm(true);
  };

  const disconnectDevice = async () => {
    if (!disconnectTarget) return;
    setShowDisconnectConfirm(false);
    setDisconnectingId(disconnectTarget);
    try {
      await api.devices.remove(disconnectTarget);
      const updated = await api.devices.list();
      setDevices(updated);
      toast('success', t.success);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setDisconnectingId(null);
      setDisconnectTarget(null);
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      await api.backup.download();
      const res = await api.backup.check();
      setLastBackup(res.lastBackup);
      toast('success', t.backupDownloaded);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreClick = () => {
    restoreFileRef.current = null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        restoreFileRef.current = file;
        setShowRestoreConfirm(true);
      }
    };
    input.click();
  };

  const handleRestoreConfirm = async () => {
    if (!restoreFileRef.current) return;
    setShowRestoreConfirm(false);
    setRestoring(true);
    try {
      await api.backup.restore(restoreFileRef.current);
      toast('success', t.restoreSuccess);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setRestoring(false);
    }
  };

  const handleSaveBilling = async () => {
    setBillingSaving(true); setBillingMessage('');
    try {
      await api.settings.updateBilling(billing);
      setBillingMessage(t.success + '!');
      toast('success', t.success);
    } catch (err: any) { toast('error', err.message); }
    finally { setBillingSaving(false); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await api.settings.uploadLogo(file);
      setBilling((prev: any) => ({ ...prev, logo_url: res.logo_url }));
      toast('success', t.success);
    } catch (err: any) { toast('error', err.message); }
    finally { setUploadingLogo(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingStamp(true);
    try {
      const res = await api.settings.uploadStamp(file);
      setBilling((prev: any) => ({ ...prev, stamp_url: res.stamp_url }));
      toast('success', t.success);
    } catch (err: any) { toast('error', err.message); }
    finally { setUploadingStamp(false); if (stampInputRef.current) stampInputRef.current.value = ''; }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingSignature(true);
    try {
      const res = await api.settings.uploadSignature(file);
      setBilling((prev: any) => ({ ...prev, signature_url: res.signature_url }));
      toast('success', t.success);
    } catch (err: any) { toast('error', err.message); }
    finally { setUploadingSignature(false); if (signatureInputRef.current) signatureInputRef.current.value = ''; }
  };

  const handleRemoveLogo = async () => {
    try { await api.settings.removeLogo(); setBilling((prev: any) => ({ ...prev, logo_url: '' })); toast('success', t.success); } catch (err: any) { toast('error', err.message); }
  };

  const handleRemoveStamp = async () => {
    try { await api.settings.removeStamp(); setBilling((prev: any) => ({ ...prev, stamp_url: '' })); toast('success', t.success); } catch (err: any) { toast('error', err.message); }
  };

  const handleRemoveSignature = async () => {
    try { await api.settings.removeSignature(); setBilling((prev: any) => ({ ...prev, signature_url: '' })); toast('success', t.success); } catch (err: any) { toast('error', err.message); }
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

      {/* Billing Settings */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Receipt className="w-5 h-5" /> {t.billingSettings || 'Billing Settings'}
        </h2>
        {billingLoading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">{t.shopName}</label><input type="text" value={billing.shop_name || ''} onChange={e => setBilling({...billing, shop_name: e.target.value})} className="input" placeholder="Business Name" /></div>
              <div><label className="label">{t.address || 'Address'}</label><input type="text" value={billing.address || ''} onChange={e => setBilling({...billing, address: e.target.value})} className="input" placeholder="Address" /></div>
              <div><label className="label">{t.phone}</label><input type="text" value={billing.phone || ''} onChange={e => setBilling({...billing, phone: e.target.value})} className="input" placeholder="Phone" /></div>
              <div><label className="label">{t.email || 'Email'}</label><input type="email" value={billing.email || ''} onChange={e => setBilling({...billing, email: e.target.value})} className="input" placeholder="Email" /></div>
              <div><label className="label">{t.website || 'Website'}</label><input type="url" value={billing.website || ''} onChange={e => setBilling({...billing, website: e.target.value})} className="input" placeholder="https://..." /></div>
              <div><label className="label">PAN</label><input type="text" value={billing.pan || ''} onChange={e => setBilling({...billing, pan: e.target.value})} className="input" placeholder="PAN Number" /></div>
              <div><label className="label">{t.vatNumber || 'VAT Registration No.'}</label><input type="text" value={billing.vat_number || ''} onChange={e => setBilling({...billing, vat_number: e.target.value})} className="input" placeholder="Optional" /></div>
              <div><label className="label">{t.vatRate || 'VAT Rate (%)'}</label><input type="number" value={billing.vat_rate || 13} onChange={e => setBilling({...billing, vat_rate: parseFloat(e.target.value) || 0})} className="input" min="0" max="100" /></div>
            </div>

            {/* Bill Language & Paper Size */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="label">{t.billLanguage || 'Bill Language'}</label>
                <select value={billing.bill_language || 'en'} onChange={e => setBilling({...billing, bill_language: e.target.value})} className="input">
                  <option value="en">English</option>
                  <option value="ne">Nepali</option>
                  <option value="bilingual">Bilingual</option>
                </select>
              </div>
              <div>
                <label className="label">{t.paperSize || 'Paper Size'}</label>
                <select value={billing.bill_paper_size || 'A4'} onChange={e => setBilling({...billing, bill_paper_size: e.target.value})} className="input">
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                  <option value="thermal">Thermal Receipt</option>
                </select>
              </div>
              <div>
                <label className="label">{t.billType || 'Bill Type'}</label>
                <select value={billing.bill_type || 'commercial'} onChange={e => setBilling({...billing, bill_type: e.target.value})} className="input">
                  <option value="commercial">Commercial Bill</option>
                  <option value="tax_invoice">Tax Invoice</option>
                  <option value="abbreviated">Abbreviated Tax Invoice</option>
                </select>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="pt-2">
              <label className="label">{t.shopLogo || 'Shop Logo'}</label>
              <div className="flex items-center gap-4">
                {billing.logo_url ? (
                  <div className="flex items-center gap-3">
                    <img src={billing.logo_url} alt="Logo" className="h-16 w-16 object-contain border rounded-lg dark:border-gray-600" />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => logoInputRef.current?.click()} className="text-sm text-primary-600 hover:text-primary-700">{t.replaceLogo || 'Replace'}</button>
                      <button onClick={handleRemoveLogo} className="text-sm text-red-600 hover:text-red-700">{t.removeLogo || 'Remove'}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="btn-secondary text-sm flex items-center gap-2">
                    <Upload className="w-4 h-4" /> {uploadingLogo ? t.loading : t.uploadLogo || 'Upload Logo'}
                  </button>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </div>
              <p className="text-xs text-gray-400 mt-1">PNG / JPG — {t.recommended || 'Recommended'}</p>
            </div>

            {/* Stamp Upload */}
            <div className="pt-2">
              <label className="label">{t.shopStamp || 'Shop Stamp'} <span className="text-gray-400 font-normal">({t.optional})</span></label>
              <div className="flex items-center gap-4">
                {billing.stamp_url ? (
                  <div className="flex items-center gap-3">
                    <img src={billing.stamp_url} alt="Stamp" className="h-16 w-16 object-contain border rounded-lg dark:border-gray-600" />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => stampInputRef.current?.click()} className="text-sm text-primary-600 hover:text-primary-700">{t.replaceStamp || 'Replace'}</button>
                      <button onClick={handleRemoveStamp} className="text-sm text-red-600 hover:text-red-700">{t.removeStamp || 'Remove'}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => stampInputRef.current?.click()} disabled={uploadingStamp} className="btn-secondary text-sm flex items-center gap-2">
                    <Upload className="w-4 h-4" /> {uploadingStamp ? t.loading : t.uploadStamp || 'Upload Stamp'}
                  </button>
                )}
                <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
              </div>
              <p className="text-xs text-gray-400 mt-1">PNG / JPG — {t.optional}</p>
            </div>

            <div className="pt-2">
              <label className="label">Seller's Signature <span className="text-gray-400 font-normal">({t.optional})</span></label>
              <div className="flex items-center gap-4">
                {billing.signature_url ? (
                  <div className="flex items-center gap-3">
                    <img src={billing.signature_url} alt="Signature" className="h-12 w-40 object-contain border rounded-lg dark:border-gray-600" />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => signatureInputRef.current?.click()} className="text-sm text-primary-600 hover:text-primary-700">{t.replaceStamp || 'Replace'}</button>
                      <button onClick={handleRemoveSignature} className="text-sm text-red-600 hover:text-red-700">{t.removeStamp || 'Remove'}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => signatureInputRef.current?.click()} disabled={uploadingSignature} className="btn-secondary text-sm flex items-center gap-2">
                    <Upload className="w-4 h-4" /> {uploadingSignature ? t.loading : 'Upload Signature'}
                  </button>
                )}
                <input ref={signatureInputRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
              </div>
              <p className="text-xs text-gray-400 mt-1">PNG / JPG — {t.optional}</p>
            </div>

            {billingMessage && <p className="text-sm text-primary-600">{billingMessage}</p>}
            <button onClick={handleSaveBilling} disabled={billingSaving} className="btn-primary">{billingSaving ? t.loading : t.saveBilling || 'Save Billing Settings'}</button>
          </div>
        )}
      </div>

      {/* Backup & Restore */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2"><Shield className="w-5 h-5" /> {t.backupRestore}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t.backupDesc}</p>
        {lastBackup && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Last backup: {new Date(lastBackup).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        )}
        <div className="flex gap-3">
          <button onClick={handleBackup} disabled={backingUp} className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {backingUp ? t.loading : t.downloadBackup}
          </button>
          <button onClick={handleRestoreClick} disabled={restoring} className="btn-secondary flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {restoring ? t.loading : t.restoreBackup}
          </button>
        </div>
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
            <button onClick={() => handleDisconnectClick(device.id)} disabled={disconnectingId === device.id} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {disconnectingId === device.id ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        ))}</div>}
      </div>

      <ConfirmDialog
        open={showRestoreConfirm}
        title={t.restoreBackup}
        message={t.restoreConfirm}
        onConfirm={handleRestoreConfirm}
        onCancel={() => setShowRestoreConfirm(false)}
      />
      <ConfirmDialog
        open={showDisconnectConfirm}
        title={t.disconnect}
        message={t.disconnect + '?'}
        onConfirm={disconnectDevice}
        onCancel={() => setShowDisconnectConfirm(false)}
      />
    </div>
  );
}
