const API_BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('karobar_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function paginate(path: string, page?: number, limit?: number, extra?: Record<string, string>) {
  const sp = new URLSearchParams();
  if (page) sp.set('page', String(page));
  if (limit) sp.set('limit', String(limit));
  if (extra) Object.entries(extra).forEach(([k, v]) => { if (v) sp.set(k, v); });
  const qs = sp.toString();
  return request(`${path}${qs ? `?${qs}` : ''}`);
}

export const api = {
  auth: {
    register: (data: { name: string; email: string; password: string; shopName?: string }) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
  },
  dashboard: { get: () => request('/dashboard') },
  customers: {
    list: (search?: string, page?: number, limit?: number) => paginate('/customers', page, limit, search ? { search } : undefined),
    get: (id: string) => request(`/customers/${id}`),
    create: (data: any) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/customers/${id}`, { method: 'DELETE' }),
    addPayment: (id: string, data: any) => request(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  },
  products: {
    list: (search?: string, category?: string, page?: number, limit?: number) => {
      const extra: Record<string, string> = {};
      if (search) extra.search = search;
      if (category) extra.category = category;
      return paginate('/products', page, limit, Object.keys(extra).length ? extra : undefined);
    },
    get: (id: string) => request(`/products/${id}`),
    create: (data: any) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),
    import: (products: any[]) => request('/products/import', { method: 'POST', body: JSON.stringify({ products }) }),
  },
  orders: {
    list: (status?: string, page?: number, limit?: number) => paginate('/orders', page, limit, status ? { status } : undefined),
    get: (id: string) => request(`/orders/${id}`),
    create: (data: any) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    complete: (id: string) => request(`/orders/${id}/complete`, { method: 'POST' }),
  },
  sales: {
    list: (params?: { search?: string; from?: string; to?: string; page?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.search) sp.set('search', params.search);
      if (params?.from) sp.set('from', params.from);
      if (params?.to) sp.set('to', params.to);
      if (params?.page) sp.set('page', String(params.page));
      if (params?.limit) sp.set('limit', String(params.limit));
      return request(`/sales${sp.toString() ? `?${sp}` : ''}`);
    },
    create: (data: any) => request('/sales', { method: 'POST', body: JSON.stringify(data) }),
  },
  returns: {
    list: () => request('/returns'),
    create: (data: any) => request('/returns', { method: 'POST', body: JSON.stringify(data) }),
  },
  inventory: {
    adjust: (data: any) => request('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
    adjustments: () => request('/inventory/adjustments'),
  },
  profitLoss: {
    get: (params?: { period?: string; from?: string; to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.period) sp.set('period', params.period);
      if (params?.from) sp.set('from', params.from);
      if (params?.to) sp.set('to', params.to);
      return request(`/profit-loss${sp.toString() ? `?${sp}` : ''}`);
    },
  },
  notifications: {
    list: () => request('/notifications'),
    markRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PUT' }),
    markAllRead: () => request('/notifications/read-all', { method: 'PUT' }),
  },
  qr: {
    generate: () => request('/qr/generate', { method: 'POST' }),
    connect: (data: { token: string; deviceName: string; deviceType: string }) => request('/qr/connect', { method: 'POST', body: JSON.stringify(data) }),
  },
  devices: {
    list: () => request('/devices'),
    remove: (id: string) => request(`/devices/${id}`, { method: 'DELETE' }),
  },
  categories: { list: () => request('/categories') },
  settings: {
    updateShop: (shopName: string) => request('/settings/shop', { method: 'PUT', body: JSON.stringify({ shopName }) }),
    updateLanguage: (language: string) => request('/settings/language', { method: 'PUT', body: JSON.stringify({ language }) }),
  },
  backup: {
    check: () => request('/backup/check'),
    download: async () => {
      const token = localStorage.getItem('karobar_token');
      const res = await fetch(`${API_BASE}/backup/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Backup download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'karobar-backup.sql';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    restore: async (file: File) => {
      const token = localStorage.getItem('karobar_token');
      const formData = new FormData();
      formData.append('backup', file);
      const res = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      return data;
    },
  },
};
