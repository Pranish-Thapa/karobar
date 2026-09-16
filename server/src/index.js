require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, query, validationResult } = require('express-validator');
const { getPool, all, get, run, transaction } = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy (Render uses reverse proxy)
app.set('trust proxy', 1);

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helpers
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('FATAL: JWT_SECRET must be set and at least 16 characters');
  process.exit(1);
}
const JWT_EXPIRY = '30d';
const BCRYPT_ROUNDS = 10;

function sanitizeError(err) {
  if (process.env.NODE_ENV === 'production') return 'Internal server error';
  return err.message;
}

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.userId) return res.status(401).json({ error: 'Invalid token' });
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// DB init
let dbReady = false;
getPool().then(() => { dbReady = true; console.log('Database ready'); }).catch(err => console.error('DB init error:', err));
const ensureDb = (req, res, next) => { if (!dbReady) return res.status(503).json({ error: 'Database not ready' }); next(); };

// ==================== AUTH ====================
app.post('/api/auth/register', authLimiter, ensureDb, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 chars)'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('shopName').optional().trim().isLength({ max: 100 }),
], validate, async (req, res) => {
  try {
    const { name, email, password, shopName } = req.body;
    const existing = await get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const id = uuidv4();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await run('INSERT INTO users (id, name, email, password_hash, shop_name) VALUES ($1, $2, $3, $4, $5)', [id, name, email, hash, shopName || 'My Shop']);
    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, user: { id, name, email, shopName: shopName || 'My Shop' } });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.post('/api/auth/login', authLimiter, ensureDb, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, shopName: user.shop_name } });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.get('/api/auth/me', auth, ensureDb, async (req, res) => {
  try {
    const user = await get('SELECT id, name, email, shop_name, language FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, email: user.email, shopName: user.shop_name, language: user.language || 'en' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== CUSTOMERS ====================
app.get('/api/customers', auth, ensureDb, apiLimiter, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (parsedPage - 1) * lim;
    if (search) {
      const rows = await all('SELECT * FROM customers WHERE user_id = $1 AND (name ILIKE $2 OR phone ILIKE $2) ORDER BY name LIMIT $3 OFFSET $4', [req.userId, `%${search}%`, lim, offset]);
      const count = await get('SELECT COUNT(*) as total FROM customers WHERE user_id = $1 AND (name ILIKE $2 OR phone ILIKE $2)', [req.userId, `%${search}%`]);
      res.json({ data: rows, total: parseInt(count.total), page: parsedPage, limit: lim });
    } else {
      const rows = await all('SELECT * FROM customers WHERE user_id = $1 ORDER BY name LIMIT $2 OFFSET $3', [req.userId, lim, offset]);
      const count = await get('SELECT COUNT(*) as total FROM customers WHERE user_id = $1', [req.userId]);
      res.json({ data: rows, total: parseInt(count.total), page: parsedPage, limit: lim });
    }
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.get('/api/customers/:id', auth, ensureDb, async (req, res) => {
  try {
    const customer = await get('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const transactions = await all(`
      SELECT s.*, string_agg(p.name, ', ') as product_names
      FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id
      WHERE s.customer_id = $1 AND s.user_id = $2 GROUP BY s.id ORDER BY s.sale_date DESC LIMIT 100
    `, [req.params.id, req.userId]);
    const payments = await all(`
      SELECT cp.* FROM customer_payments cp
      JOIN customers c ON c.id = cp.customer_id
      WHERE cp.customer_id = $1 AND c.user_id = $2 ORDER BY cp.payment_date DESC LIMIT 100
    `, [req.params.id, req.userId]);
    res.json({ ...customer, transactions, payments });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.post('/api/customers', auth, ensureDb, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Customer name is required'),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('address').optional().trim().isLength({ max: 200 }),
  body('notes').optional().trim().isLength({ max: 500 }),
], validate, async (req, res) => {
  try {
    const { name, phone, address, notes } = req.body;
    const id = uuidv4();
    await run('INSERT INTO customers (id, user_id, name, phone, address, notes) VALUES ($1, $2, $3, $4, $5, $6)', [id, req.userId, name, phone || '', address || '', notes || '']);
    const customer = await get('SELECT * FROM customers WHERE id = $1', [id]);
    res.json(customer);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.put('/api/customers/:id', auth, ensureDb, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Customer name is required'),
], validate, async (req, res) => {
  try {
    const { name, phone, address, notes } = req.body;
    const existing = await get('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });
    const result = await run('UPDATE customers SET name=$1, phone=$2, address=$3, notes=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 AND user_id=$6', [name, phone ?? existing.phone, address ?? existing.address, notes ?? existing.notes, req.params.id, req.userId]);
    const customer = await get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    res.json(customer);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.delete('/api/customers/:id', auth, ensureDb, async (req, res) => {
  try {
    await transaction(async (client) => {
      const cust = await client.query('SELECT id FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
      if (cust.rows.length === 0) throw new Error('Customer not found');
      await client.query('DELETE FROM customer_payments WHERE customer_id = $1', [req.params.id]);
      await client.query('DELETE FROM returns WHERE customer_id = $1', [req.params.id]);
      await client.query('UPDATE sales SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);
      await client.query('UPDATE orders SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);
      await client.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    });
    res.json({ message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== CUSTOMER PAYMENTS ====================
app.post('/api/customers/:id/payments', auth, ensureDb, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid payment amount is required'),
  body('sale_id').optional().isString(),
  body('notes').optional().trim().isLength({ max: 500 }),
], validate, async (req, res) => {
  try {
    const { amount, sale_id, notes } = req.body;
    const result = await transaction(async (client) => {
      const customer = await client.query('SELECT * FROM customers WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.userId]);
      if (customer.rows.length === 0) throw new Error('Customer not found');
      const c = customer.rows[0];
      if (amount > c.outstanding_dues) throw new Error('Payment amount exceeds outstanding dues');
      await client.query('INSERT INTO customer_payments (id, customer_id, sale_id, amount, notes) VALUES ($1, $2, $3, $4, $5)', [uuidv4(), req.params.id, sale_id || null, amount, notes || '']);
      await client.query('UPDATE customers SET total_paid = total_paid + $1, outstanding_dues = GREATEST(0, outstanding_dues - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, req.params.id]);
      if (sale_id) {
        const sale = await client.query('SELECT * FROM sales WHERE id = $1 AND customer_id = $2 FOR UPDATE', [sale_id, req.params.id]);
        if (sale.rows.length > 0) {
          await client.query('UPDATE sales SET amount_paid = amount_paid + $1, due_amount = GREATEST(0, due_amount - $1) WHERE id = $2', [amount, sale_id]);
          if (sale.rows[0].order_id) await client.query('UPDATE orders SET amount_paid = amount_paid + $1, due_amount = GREATEST(0, due_amount - $1) WHERE id = $2', [amount, sale.rows[0].order_id]);
        }
      }
      const updated = await client.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
      return updated.rows[0];
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==================== PRODUCTS ====================
app.get('/api/products', auth, ensureDb, apiLimiter, async (req, res) => {
  try {
    const { search, category, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (parsedPage - 1) * lim;
    let where = 'WHERE user_id = $1';
    const params = [req.userId];
    let paramIdx = 2;
    if (search) { where += ` AND (name ILIKE $${paramIdx} OR sku ILIKE $${paramIdx})`; params.push(`%${search}%`); paramIdx++; }
    if (category) { where += ` AND category = $${paramIdx}`; params.push(category); paramIdx++; }
    params.push(lim, offset);
    const rows = await all(`SELECT * FROM products ${where} ORDER BY name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`, params);
    const countParams = params.slice(0, -2);
    const count = await get(`SELECT COUNT(*) as total FROM products ${where}`, countParams);
    res.json({ data: rows, total: parseInt(count.total), page: parsedPage, limit: lim });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.get('/api/products/:id', auth, ensureDb, async (req, res) => {
  try {
    const product = await get('SELECT * FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.post('/api/products', auth, ensureDb, [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Product name is required'),
  body('actual_price').optional().isFloat({ min: 0 }),
  body('selling_price').optional().isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
], validate, async (req, res) => {
  try {
    const { name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description } = req.body;
    const id = uuidv4();
    await run('INSERT INTO products (id, user_id, name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, req.userId, name, sku || '', category || 'General', actual_price || 0, selling_price || 0, stock || 0, low_stock_threshold || 5, unit || 'pcs', description || '']);
    if ((stock || 0) <= (low_stock_threshold || 5)) {
      await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${name} is low in stock. Only ${stock || 0} units remaining.`, id, 'product']);
    }
    const product = await get('SELECT * FROM products WHERE id = $1', [id]);
    res.json(product);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.put('/api/products/:id', auth, ensureDb, [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Product name is required'),
  body('actual_price').optional().isFloat({ min: 0 }),
  body('selling_price').optional().isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
], validate, async (req, res) => {
  try {
    const { name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description } = req.body;
    const existing = await get('SELECT * FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const result = await run('UPDATE products SET name=$1, sku=$2, category=$3, actual_price=$4, selling_price=$5, stock=$6, low_stock_threshold=$7, unit=$8, description=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$10 AND user_id=$11', [name, sku ?? existing.sku, category ?? existing.category, actual_price ?? existing.actual_price, selling_price ?? existing.selling_price, stock ?? existing.stock, low_stock_threshold ?? existing.low_stock_threshold, unit ?? existing.unit, description ?? existing.description, req.params.id, req.userId]);
    const finalStock = stock ?? existing.stock;
    const finalThreshold = low_stock_threshold ?? existing.low_stock_threshold;
    if (finalStock <= finalThreshold) {
      const existingNotif = await get('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, req.params.id, 'low_stock']);
      if (!existingNotif) await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${name} is low in stock. Only ${finalStock} units remaining.`, req.params.id, 'product']);
    }
    const product = await get('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(product);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.delete('/api/products/:id', auth, ensureDb, async (req, res) => {
  try {
    await transaction(async (client) => {
      const prod = await client.query('SELECT id FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
      if (prod.rows.length === 0) throw new Error('Product not found');
      await client.query('DELETE FROM sale_items WHERE product_id = $1', [req.params.id]);
      await client.query('DELETE FROM order_items WHERE product_id = $1', [req.params.id]);
      await client.query('DELETE FROM returns WHERE product_id = $1', [req.params.id]);
      await client.query('DELETE FROM inventory_adjustments WHERE product_id = $1', [req.params.id]);
      await client.query('DELETE FROM notifications WHERE entity_id = $1 AND entity_type = $2', [req.params.id, 'product']);
      await client.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    });
    res.json({ message: 'Product deleted' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== ORDERS ====================
app.get('/api/orders', auth, ensureDb, apiLimiter, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (parsedPage - 1) * lim;
    let where = 'WHERE o.user_id = $1';
    const params = [req.userId];
    let paramIdx = 2;
    if (status) { where += ` AND o.status = $${paramIdx}`; params.push(status); paramIdx++; }
    params.push(lim, offset);
    const orders = await all(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone,
        string_agg(p.name || ' (' || oi.quantity || ')', ', ') as items
      FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id
      ${where} GROUP BY o.id, c.name, c.phone ORDER BY o.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, params);
    const countParams = params.slice(0, -2);
    const count = await get(`SELECT COUNT(*) as total FROM orders o ${where}`, countParams);
    res.json({ data: orders, total: parseInt(count.total), page: parsedPage, limit: lim });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.get('/api/orders/:id', auth, ensureDb, async (req, res) => {
  try {
    const order = await get('SELECT o.*, c.name as customer_name, c.phone as customer_phone FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND o.user_id = $2', [req.params.id, req.userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await all('SELECT oi.*, p.name as product_name, p.stock as current_stock FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1', [req.params.id]);
    res.json({ ...order, items });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.post('/api/orders', auth, ensureDb, [
  body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
  body('items.*.product_id').isString().notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
], validate, async (req, res) => {
  try {
    const { customer_id, items, notes, expected_date, amount_paid } = req.body;
    const result = await transaction(async (client) => {
      if (customer_id) {
        const cust = await client.query('SELECT id FROM customers WHERE id = $1 AND user_id = $2', [customer_id, req.userId]);
        if (cust.rows.length === 0) throw new Error('Customer not found');
      }
      const orderId = uuidv4();
      let totalAmount = 0;
      for (const item of items) {
        const productRes = await client.query('SELECT * FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE', [item.product_id, req.userId]);
        if (productRes.rows.length === 0) throw new Error('Product not found');
        const product = productRes.rows[0];
        if (item.quantity > product.stock) throw new Error(`Not enough stock for ${product.name}. Only ${product.stock} units available.`);
        totalAmount += product.selling_price * item.quantity;
        await client.query('INSERT INTO order_items (id, order_id, product_id, quantity, selling_price, actual_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(), orderId, item.product_id, item.quantity, product.selling_price, product.actual_price]);
      }
      const paid = Math.max(0, amount_paid || 0);
      if (paid > totalAmount) throw new Error('Amount paid cannot exceed total');
      await client.query('INSERT INTO orders (id, user_id, customer_id, notes, expected_date, total_amount, amount_paid, due_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [orderId, req.userId, customer_id || null, notes || '', expected_date || null, totalAmount, paid, totalAmount - paid]);
      return (await client.query('SELECT * FROM orders WHERE id = $1', [orderId])).rows[0];
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/orders/:id', auth, ensureDb, [
  body('status').optional().isIn(['upcoming', 'in_progress', 'cancelled']).withMessage('Invalid status'),
], validate, async (req, res) => {
  try {
    const { status, notes, expected_date } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed') return res.status(400).json({ error: 'Cannot modify a completed order' });
    const result = await run('UPDATE orders SET status=$1, notes=$2, expected_date=$3 WHERE id=$4 AND user_id=$5', [status || order.status, notes ?? order.notes, expected_date || order.expected_date, req.params.id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    const updated = await get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== COMPLETE ORDER ====================
app.post('/api/orders/:id/complete', auth, ensureDb, async (req, res) => {
  try {
    const result = await transaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.userId]);
      if (orderRes.rows.length === 0) throw new Error('Order not found');
      const order = orderRes.rows[0];
      if (order.status === 'completed') throw new Error('Order already completed');
      const orderItems = (await client.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id])).rows;
      if (orderItems.length === 0) throw new Error('Order has no items');
      const saleId = uuidv4();
      // Insert sale first so sale_items FK is satisfied
      await client.query('INSERT INTO sales (id, user_id, customer_id, order_id, total_amount, cost_amount, profit, amount_paid, due_amount) VALUES ($1,$2,$3,$4,0,0,0,$5,$6)', [saleId, req.userId, order.customer_id, req.params.id, order.amount_paid, 0 - order.amount_paid]);
      let totalRevenue = 0, totalCost = 0;
      for (const item of orderItems) {
        const productRes = await client.query('SELECT * FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE', [item.product_id, req.userId]);
        if (productRes.rows.length === 0) throw new Error('Product not found');
        const product = productRes.rows[0];
        if (item.quantity > product.stock) throw new Error(`Not enough stock for ${product.name}. Only ${product.stock} units available.`);
        const newStock = product.stock - item.quantity;
        await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStock, item.product_id]);
        await client.query('INSERT INTO sale_items (id, sale_id, product_id, quantity, selling_price, actual_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(), saleId, item.product_id, item.quantity, item.selling_price, item.actual_price]);
        totalRevenue += item.selling_price * item.quantity;
        totalCost += item.actual_price * item.quantity;
        if (newStock <= product.low_stock_threshold) {
          const existing = await client.query('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, item.product_id, 'low_stock']);
          if (existing.rows.length === 0) await client.query('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${newStock} units remaining.`, item.product_id, 'product']);
        }
      }
      const profit = totalRevenue - totalCost;
      await client.query('UPDATE sales SET total_amount = $1, cost_amount = $2, profit = $3, due_amount = GREATEST(0, $1 - $4) WHERE id = $5', [totalRevenue, totalCost, profit, order.amount_paid, saleId]);
      if (order.customer_id) await client.query('UPDATE customers SET total_purchases = total_purchases + $1, outstanding_dues = outstanding_dues + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [totalRevenue, totalRevenue - order.amount_paid, order.customer_id]);
      await client.query('UPDATE orders SET status = $1, completed_date = CURRENT_TIMESTAMP WHERE id = $2', ['completed', req.params.id]);
      await client.query('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'sale', 'Sale Completed', `Order completed. Profit: Rs. ${profit.toFixed(2)}`, saleId, 'sale']);
      return (await client.query('SELECT * FROM sales WHERE id = $1', [saleId])).rows[0];
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ==================== DIRECT SALE ====================
app.post('/api/sales', auth, ensureDb, [
  body('items').isArray({ min: 1 }).withMessage('Sale must have at least one item'),
  body('items.*.product_id').isString().notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
], validate, async (req, res) => {
  try {
    const { customer_id, items, amount_paid, notes } = req.body;
    const result = await transaction(async (client) => {
      if (customer_id) {
        const cust = await client.query('SELECT id FROM customers WHERE id = $1 AND user_id = $2', [customer_id, req.userId]);
        if (cust.rows.length === 0) throw new Error('Customer not found');
      }
      const saleId = uuidv4();
      // Insert sale first so sale_items FK is satisfied
      await client.query('INSERT INTO sales (id, user_id, customer_id, total_amount, cost_amount, profit, amount_paid, due_amount, notes) VALUES ($1,$2,$3,0,0,0,0,0,$4)', [saleId, req.userId, customer_id || null, notes || '']);
      let totalRevenue = 0, totalCost = 0;
      for (const item of items) {
        const productRes = await client.query('SELECT * FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE', [item.product_id, req.userId]);
        if (productRes.rows.length === 0) throw new Error('Product not found');
        const product = productRes.rows[0];
        if (item.quantity > product.stock) throw new Error(`Not enough stock for ${product.name}. Only ${product.stock} units available.`);
        const newStock = product.stock - item.quantity;
        await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStock, item.product_id]);
        await client.query('INSERT INTO sale_items (id, sale_id, product_id, quantity, selling_price, actual_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(), saleId, item.product_id, item.quantity, product.selling_price, product.actual_price]);
        totalRevenue += product.selling_price * item.quantity;
        totalCost += product.actual_price * item.quantity;
        if (newStock <= product.low_stock_threshold) {
          const existing = await client.query('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, item.product_id, 'low_stock']);
          if (existing.rows.length === 0) await client.query('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${newStock} units remaining.`, item.product_id, 'product']);
        }
      }
      const paid = Math.max(0, amount_paid || 0);
      if (paid > totalRevenue) throw new Error('Amount paid cannot exceed total');
      const due = Math.max(0, totalRevenue - paid);
      const profit = totalRevenue - totalCost;
      await client.query('UPDATE sales SET total_amount = $1, cost_amount = $2, profit = $3, amount_paid = $4, due_amount = $5 WHERE id = $6', [totalRevenue, totalCost, profit, paid, due, saleId]);
      if (customer_id) await client.query('UPDATE customers SET total_purchases = total_purchases + $1, total_paid = total_paid + $2, outstanding_dues = outstanding_dues + $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4', [totalRevenue, paid, due, customer_id]);
      return (await client.query('SELECT * FROM sales WHERE id = $1', [saleId])).rows[0];
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/sales', auth, ensureDb, apiLimiter, async (req, res) => {
  try {
    const { search, from, to, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (parsedPage - 1) * lim;

    let where = 'WHERE s.user_id = $1';
    const whereParams = [req.userId];
    let pIdx = 2;
    if (search) { where += ` AND (c.name ILIKE $${pIdx} OR c.phone ILIKE $${pIdx} OR s.id::text ILIKE $${pIdx})`; whereParams.push(`%${search}%`); pIdx++; }
    if (from) { where += ` AND s.sale_date >= $${pIdx}`; whereParams.push(from); pIdx++; }
    if (to) { where += ` AND s.sale_date <= $${pIdx}`; whereParams.push(to); pIdx++; }

    const dataParams = [...whereParams, lim, offset];
    const sales = await all(
      `SELECT s.*, c.name as customer_name, c.phone as customer_phone, string_agg(p.name || ' (' || si.quantity || ')', ', ') as items
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id
       ${where} GROUP BY s.id, c.name, c.phone ORDER BY s.sale_date DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
      dataParams
    );
    const count = await get(`SELECT COUNT(*) as total FROM sales s LEFT JOIN customers c ON c.id = s.customer_id ${where}`, whereParams);
    res.json({ data: sales, total: parseInt(count.total), page: parsedPage, limit: lim });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== DASHBOARD ====================
app.get('/api/dashboard', auth, ensureDb, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [todayAgg, pendingDues, inventoryValue, lowStockCount, upcomingOrders, salesLast7, salesLast30, recentSales, lowStockProducts] = await Promise.all([
      get("SELECT COALESCE(SUM(total_amount), 0) as total_sales, COALESCE(SUM(profit), 0) as total_profit FROM sales WHERE user_id = $1 AND date(sale_date) = $2", [req.userId, today]),
      get("SELECT COALESCE(SUM(outstanding_dues), 0) as total FROM customers WHERE user_id = $1", [req.userId]),
      get("SELECT COALESCE(SUM(actual_price * stock), 0) as total FROM products WHERE user_id = $1", [req.userId]),
      get("SELECT COUNT(*) as count FROM products WHERE user_id = $1 AND stock <= low_stock_threshold", [req.userId]),
      get("SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM orders WHERE user_id = $1 AND status = 'upcoming'", [req.userId]),
      all("SELECT date(sale_date) as date, SUM(total_amount) as total, SUM(profit) as profit FROM sales WHERE user_id = $1 AND sale_date >= NOW() - INTERVAL '7 days' GROUP BY date(sale_date) ORDER BY date", [req.userId]),
      all("SELECT date(sale_date) as date, SUM(total_amount) as total, SUM(profit) as profit FROM sales WHERE user_id = $1 AND sale_date >= NOW() - INTERVAL '30 days' GROUP BY date(sale_date) ORDER BY date", [req.userId]),
      all(`SELECT s.*, c.name as customer_name, string_agg(p.name, ', ') as product_names FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id WHERE s.user_id = $1 GROUP BY s.id, c.name ORDER BY s.sale_date DESC LIMIT 5`, [req.userId]),
      all("SELECT name, stock, low_stock_threshold FROM products WHERE user_id = $1 AND stock <= low_stock_threshold ORDER BY stock ASC", [req.userId]),
    ]);
    res.json({
      todaySales: todayAgg?.total_sales || 0, todayProfit: todayAgg?.total_profit || 0,
      pendingDues: pendingDues?.total || 0, inventoryValue: inventoryValue?.total || 0,
      lowStockCount: lowStockCount?.count || 0, upcomingOrders: upcomingOrders?.count || 0,
      upcomingOrdersValue: upcomingOrders?.total || 0,
      salesLast7: salesLast7.map(r => ({ date: r.date, total: r.total })), salesLast30: salesLast30.map(r => ({ date: r.date, total: r.total })),
      profitLast7: salesLast7.map(r => ({ date: r.date, total: r.profit })), profitLast30: salesLast30.map(r => ({ date: r.date, total: r.profit })),
      recentSales, lowStockProducts
    });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== PROFIT & LOSS ====================
app.get('/api/profit-loss', auth, ensureDb, async (req, res) => {
  try {
    const { period, from, to } = req.query;
    let dateFilter = '';
    const params = [req.userId];
    let paramIdx = 2;
    const today = new Date().toISOString().split('T')[0];
    if (period === 'today') { dateFilter = `AND date(s.sale_date) = $${paramIdx}`; params.push(today); paramIdx++; }
    else if (period === '7days') { dateFilter = "AND s.sale_date >= NOW() - INTERVAL '7 days'"; }
    else if (period === '30days') { dateFilter = "AND s.sale_date >= NOW() - INTERVAL '30 days'"; }
    else if (period === '90days') { dateFilter = "AND s.sale_date >= NOW() - INTERVAL '90 days'"; }
    else if (from && to) { dateFilter = `AND s.sale_date >= $${paramIdx} AND s.sale_date <= $${paramIdx + 1}`; params.push(from, to); paramIdx += 2; }
    const summary = await get(`SELECT COALESCE(SUM(s.total_amount), 0) as total_revenue, COALESCE(SUM(s.cost_amount), 0) as total_cost, COALESCE(SUM(s.profit), 0) as total_profit, COUNT(*) as sale_count, COALESCE(SUM(s.amount_paid), 0) as amount_received, COALESCE(SUM(s.due_amount), 0) as outstanding_dues FROM sales s WHERE s.user_id = $1 ${dateFilter}`, params);
    const avgProfit = summary && summary.sale_count > 0 ? summary.total_profit / summary.sale_count : 0;
    const mostProfitableSale = await get(`SELECT s.*, c.name as customer_name, string_agg(p.name || ' (' || si.quantity || ')', ', ') as items FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id WHERE s.user_id = $1 ${dateFilter} GROUP BY s.id, c.name ORDER BY s.profit DESC LIMIT 1`, params);
    const profitableProducts = await all(`SELECT p.name, SUM(si.quantity) as units_sold, SUM(si.selling_price * si.quantity) as revenue, SUM(si.actual_price * si.quantity) as cost, SUM((si.selling_price - si.actual_price) * si.quantity) as profit FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id WHERE s.user_id = $1 ${dateFilter} GROUP BY p.id, p.name ORDER BY profit DESC`, params);
    const topDuesCustomers = await all('SELECT name, outstanding_dues FROM customers WHERE user_id = $1 AND outstanding_dues > 0 ORDER BY outstanding_dues DESC', [req.userId]);
    res.json({ summary: { ...summary, avg_profit: avgProfit }, mostProfitableSale, profitableProducts, topDuesCustomers });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== NOTIFICATIONS ====================
app.get('/api/notifications', auth, ensureDb, async (req, res) => {
  try {
    const notifications = await all('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.userId]);
    res.json(notifications);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.put('/api/notifications/:id/read', auth, ensureDb, async (req, res) => {
  try {
    await run('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.put('/api/notifications/read-all', auth, ensureDb, async (req, res) => {
  try {
    await run('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.userId]);
    res.json({ message: 'All marked as read' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== QR DEVICE CONNECTION ====================
app.post('/api/qr/generate', auth, ensureDb, async (req, res) => {
  try {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await run('INSERT INTO qr_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [uuidv4(), req.userId, token, expiresAt]);
    const qrImage = await QRCode.toDataURL(JSON.stringify({ token, userId: req.userId }));
    res.json({ qr: qrImage, token, expiresAt });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.post('/api/qr/connect', ensureDb, authLimiter, async (req, res) => {
  try {
    const { token, deviceName, deviceType } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });
    const result = await transaction(async (client) => {
      const qrRes = await client.query('SELECT * FROM qr_tokens WHERE token = $1 AND used = FALSE FOR UPDATE', [token]);
      if (qrRes.rows.length === 0) throw new Error('Invalid or expired QR code');
      const qrToken = qrRes.rows[0];
      if (new Date(qrToken.expires_at) < new Date()) throw new Error('QR code has expired');
      await client.query('UPDATE qr_tokens SET used = TRUE WHERE token = $1', [token]);
      await client.query('INSERT INTO connected_devices (id, user_id, device_name, device_type) VALUES ($1, $2, $3, $4)', [uuidv4(), qrToken.user_id, deviceName || 'Unknown Device', deviceType || 'unknown']);
      const authToken = jwt.sign({ userId: qrToken.user_id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
      const user = (await client.query('SELECT id, name, email, shop_name FROM users WHERE id = $1', [qrToken.user_id])).rows[0];
      return { token: authToken, user: { id: user.id, name: user.name, email: user.email, shopName: user.shop_name } };
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/devices', auth, ensureDb, async (req, res) => {
  try {
    const devices = await all('SELECT * FROM connected_devices WHERE user_id = $1 ORDER BY last_active DESC', [req.userId]);
    res.json(devices);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.delete('/api/devices/:id', auth, ensureDb, async (req, res) => {
  try {
    await run('DELETE FROM connected_devices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ message: 'Device disconnected' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.get('/api/categories', auth, ensureDb, async (req, res) => {
  try {
    const categories = await all('SELECT DISTINCT category FROM products WHERE user_id = $1 ORDER BY category', [req.userId]);
    res.json(categories.map(c => c.category));
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== RETURNS ====================
app.post('/api/returns', auth, ensureDb, [
  body('sale_id').isString().notEmpty(),
  body('product_id').isString().notEmpty(),
  body('quantity').isInt({ min: 1 }),
], validate, async (req, res) => {
  try {
    const { sale_id, product_id, quantity, reason, notes } = req.body;
    const result = await transaction(async (client) => {
      const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 AND user_id = $2 FOR UPDATE', [sale_id, req.userId]);
      if (saleRes.rows.length === 0) throw new Error('Sale not found');
      const sale = saleRes.rows[0];
      const saleItemRes = await client.query('SELECT * FROM sale_items WHERE sale_id = $1 AND product_id = $2', [sale_id, product_id]);
      if (saleItemRes.rows.length === 0) throw new Error('Product not found in this sale');
      const saleItem = saleItemRes.rows[0];
      if (quantity > saleItem.quantity) throw new Error(`Cannot return more than sold (${saleItem.quantity})`);
      const refund = saleItem.selling_price * quantity;
      const id = uuidv4();
      await client.query('INSERT INTO returns (id, user_id, sale_id, customer_id, product_id, quantity, reason, refund_amount, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.userId, sale_id, sale.customer_id, product_id, quantity, reason || '', refund, notes || '']);
      // Lock product for stock update
      await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]);
      await client.query('UPDATE products SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [quantity, product_id]);
      // Fix accounting: reduce total_amount and recalculate due_amount
      const newTotal = Number(sale.total_amount) - refund;
      const newDue = Math.max(0, newTotal - Number(sale.amount_paid));
      const oldDue = Math.max(0, Number(sale.total_amount) - Number(sale.amount_paid));
      const dueReduction = oldDue - newDue;
      await client.query('UPDATE sales SET total_amount = total_amount - $1, profit = profit - ($1 - $2 * $3), due_amount = GREATEST(0, total_amount - $1 - amount_paid) WHERE id = $4', [refund, saleItem.actual_price, quantity, sale_id]);
      if (sale.customer_id) await client.query('UPDATE customers SET total_purchases = GREATEST(0, total_purchases - $1), outstanding_dues = GREATEST(0, outstanding_dues - $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3', [refund, dueReduction, sale.customer_id]);
      return (await client.query('SELECT * FROM returns WHERE id = $1', [id])).rows[0];
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/returns', auth, ensureDb, async (req, res) => {
  try {
    const returns = await all(`SELECT r.*, p.name as product_name, c.name as customer_name FROM returns r LEFT JOIN products p ON p.id = r.product_id LEFT JOIN customers c ON c.id = r.customer_id WHERE r.user_id = $1 ORDER BY r.return_date DESC`, [req.userId]);
    res.json(returns);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== INVENTORY ADJUSTMENTS ====================
app.post('/api/inventory/adjust', auth, ensureDb, [
  body('product_id').isString().notEmpty(),
  body('adjustment').isInt(),
  body('reason').trim().isLength({ min: 1, max: 200 }),
], validate, async (req, res) => {
  try {
    const { product_id, adjustment, reason, notes } = req.body;
    if (adjustment === 0) return res.status(400).json({ error: 'Adjustment cannot be zero' });
    const result = await transaction(async (client) => {
      const productRes = await client.query('SELECT * FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE', [product_id, req.userId]);
      if (productRes.rows.length === 0) throw new Error('Product not found');
      const product = productRes.rows[0];
      const newStock = product.stock + adjustment;
      if (newStock < 0) throw new Error(`Cannot adjust below zero. Current stock: ${product.stock}`);
      const id = uuidv4();
      await client.query('INSERT INTO inventory_adjustments (id, user_id, product_id, adjustment, reason, previous_stock, new_stock, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, req.userId, product_id, adjustment, reason, product.stock, newStock, notes || '']);
      await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStock, product_id]);
      if (newStock <= product.low_stock_threshold) {
        const existing = await client.query('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, product_id, 'low_stock']);
        if (existing.rows.length === 0) await client.query('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${newStock} units remaining.`, product_id, 'product']);
      }
      return (await client.query('SELECT * FROM inventory_adjustments WHERE id = $1', [id])).rows[0];
    });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/inventory/adjustments', auth, ensureDb, async (req, res) => {
  try {
    const adjustments = await all(`SELECT ia.*, p.name as product_name FROM inventory_adjustments ia LEFT JOIN products p ON p.id = ia.product_id WHERE ia.user_id = $1 ORDER BY ia.adjusted_at DESC`, [req.userId]);
    res.json(adjustments);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== BULK PRODUCT IMPORT ====================
app.post('/api/products/import', auth, ensureDb, async (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) return res.status(400).json({ error: 'No products to import' });
    if (products.length > 1000) return res.status(400).json({ error: 'Maximum 1000 products per import' });
    const result = await transaction(async (client) => {
      let imported = 0;
      const errors = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const row = i + 1;
        if (!p.name || !p.name.trim()) { errors.push({ row, reason: 'Name is required' }); continue; }
        const actual = parseFloat(p.actual_price) || 0;
        const selling = parseFloat(p.selling_price) || 0;
        const stock = parseInt(p.stock) || 0;
        if (actual < 0) { errors.push({ row, reason: 'Cost price cannot be negative' }); continue; }
        if (selling < 0) { errors.push({ row, reason: 'Selling price cannot be negative' }); continue; }
        if (stock < 0) { errors.push({ row, reason: 'Stock cannot be negative' }); continue; }
        const id = uuidv4();
        await client.query('INSERT INTO products (id, user_id, name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, req.userId, p.name.trim(), p.sku || '', p.category || 'General', actual, selling, stock, parseInt(p.low_stock_threshold) || 5, p.unit || 'pcs', p.description || '']);
        imported++;
        if (stock <= (parseInt(p.low_stock_threshold) || 5)) {
          await client.query('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${p.name.trim()} is low in stock. Only ${stock} units remaining.`, id, 'product']);
        }
      }
      return { imported, errors, total: products.length };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== SETTINGS ====================
app.put('/api/settings/language', auth, ensureDb, [
  body('language').isIn(['en', 'ne']).withMessage('Language must be en or ne'),
], validate, async (req, res) => {
  try {
    const { language } = req.body;
    await run('UPDATE users SET language = $1 WHERE id = $2', [language, req.userId]);
    res.json({ message: 'Language updated' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.put('/api/settings/shop', auth, ensureDb, [
  body('shopName').trim().isLength({ min: 1, max: 100 }).withMessage('Shop name is required'),
], validate, async (req, res) => {
  try {
    const { shopName } = req.body;
    await run('UPDATE users SET shop_name = $1 WHERE id = $2', [shopName, req.userId]);
    res.json({ message: 'Shop name updated' });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ==================== BACKUP & RESTORE ====================
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
const execFileAsync = promisify(execFile);

const BACKUP_INTERVAL_DAYS = 10;

app.get('/api/backup/check', auth, ensureDb, async (req, res) => {
  try {
    const user = await get('SELECT last_backup_at FROM users WHERE id = $1', [req.userId]);
    const lastBackup = user?.last_backup_at;
    if (!lastBackup) return res.json({ needsBackup: true, lastBackup: null });
    const daysSince = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    res.json({ needsBackup: daysSince >= BACKUP_INTERVAL_DAYS, lastBackup });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

app.get('/api/backup/download', auth, ensureDb, async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return res.status(500).json({ error: 'Database URL not configured' });

    const tmpFile = path.join(os.tmpdir(), `karobar-backup-${Date.now()}.sql`);
    try {
      await execFileAsync('pg_dump', [
        '--no-owner', '--no-privileges', '--clean', '--if-exists',
        '-f', tmpFile, dbUrl
      ], { timeout: 60000 });
    } catch (dumpErr) {
      // pg_dump might not be available, fallback to manual dump
      console.error('pg_dump failed, using manual backup:', dumpErr.message);
      await manualBackup(dbUrl, tmpFile);
    }

    await run('UPDATE users SET last_backup_at = CURRENT_TIMESTAMP WHERE id = $1', [req.userId]);

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="karobar-backup.sql"');

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('end', () => { fs.unlink(tmpFile, () => {}); });
    stream.on('error', () => { fs.unlink(tmpFile, () => {}); res.status(500).json({ error: 'Backup read failed' }); });
  } catch (err) { res.status(500).json({ error: sanitizeError(err) }); }
});

async function manualBackup(dbUrl, tmpFile) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    let sql = '-- Karobar Backup\n-- Generated: ' + new Date().toISOString() + '\n\n';
    sql += 'SET session_replication_role = replica;\n\n';
    // Child tables first (so TRUNCATE CASCADE works correctly)
    const tables = ['inventory_adjustments', 'returns', 'notifications', 'customer_payments', 'sale_items', 'order_items', 'sales', 'orders', 'products', 'customers', 'connected_devices', 'qr_tokens', 'users'];
    // First pass: truncate all
    sql += '-- Truncate all tables\n';
    for (const table of tables) {
      sql += `TRUNCATE TABLE ${table} CASCADE;\n`;
    }
    sql += '\n';
    // Second pass: insert data in parent-first order
    const insertOrder = ['users', 'qr_tokens', 'connected_devices', 'customers', 'products', 'orders', 'order_items', 'sales', 'sale_items', 'customer_payments', 'notifications', 'returns', 'inventory_adjustments'];
    for (const table of insertOrder) {
      const rows = (await client.query(`SELECT * FROM ${table}`)).rows;
      if (rows.length === 0) continue;
      sql += `-- Table: ${table} (${rows.length} rows)\n`;
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => {
          const v = row[c];
          if (v === null) return 'NULL';
          if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
          if (v instanceof Date) return `'${v.toISOString()}'`;
          if (typeof v === 'number') return v;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
      }
      sql += '\n';
    }
    sql += 'SET session_replication_role = origin;\n';
    fs.writeFileSync(tmpFile, sql);
  } finally { client.release(); }
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDoubleQuote) {
      if (inSingleQuote && sql[i + 1] === "'") { current += "''"; i++; }
      else inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }
    if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed);
  return statements;
}

app.post('/api/backup/restore', auth, ensureDb, upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

    const sqlContent = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);

    if (!sqlContent || sqlContent.trim().length === 0) {
      return res.status(400).json({ error: 'Backup file is empty' });
    }

    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const statements = splitSqlStatements(sqlContent);
      let failed = 0;
      for (const stmt of statements) {
        try {
          await client.query(stmt);
        } catch (e) {
          failed++;
          console.error('Restore statement error:', e.message, stmt.substring(0, 100));
        }
      }
      if (failed > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Restore failed: ${failed} statements had errors. Database was not modified.` });
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ message: 'Backup restored successfully' });
  } catch (err) { res.status(500).json({ error: 'Restore failed: ' + sanitizeError(err) }); }
});

// ==================== STATIC / CATCH-ALL ====================
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(publicDir, 'index.html'), err => { if (err) res.status(404).send('Not found'); });
});

// Graceful shutdown
process.on('SIGTERM', async () => { console.log('SIGTERM received'); const p = await getPool().catch(() => null); if (p) await p.end(); process.exit(0); });
process.on('SIGINT', async () => { console.log('SIGINT received'); const p = await getPool().catch(() => null); if (p) await p.end(); process.exit(0); });

app.listen(PORT, () => { console.log(`Karobar server running on port ${PORT}`); });
