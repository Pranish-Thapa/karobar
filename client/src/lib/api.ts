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

export const api = {
  auth: {
    register: (data: { name: string; email: string; password: string; shopName?: string }) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
  },
  dashboard: { get: () => request('/dashboard') },
  customers: {
    list: (search?: string) => request(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: string) => request(`/customers/${id}`),
    create: (data: any) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/customers/${id}`, { method: 'DELETE' }),
    addPayment: (id: string, data: any) => request(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  },
  products: {
    list: (search?: string, category?: string) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      return request(`/products${params.toString() ? `?${params}` : ''}`);
    },
    get: (id: string) => request(`/products/${id}`),
    create: (data: any) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),
    import: (products: any[]) => request('/products/import', { method: 'POST', body: JSON.stringify({ products }) }),
  },
  orders: {
    list: (status?: string) => request(`/orders${status ? `?status=${status}` : ''}`),
    get: (id: string) => request(`/orders/${id}`),
    create: (data: any) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    complete: (id: string) => request(`/orders/${id}/complete`, { method: 'POST' }),
  },
  sales: {
    list: (params?: { search?: string; from?: string; to?: string; customer_id?: string }) => {
      const sp = new URLSearchParams();
      if (params?.search) sp.set('search', params.search);
      if (params?.from) sp.set('from', params.from);
      if (params?.to) sp.set('to', params.to);
      if (params?.customer_id) sp.set('customer_id', params.customer_id);
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
};
