require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { getPool, all, get, run } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Initialize DB on startup
let dbReady = false;
getPool().then(() => { dbReady = true; console.log('Database ready'); }).catch(err => console.error('DB init error:', err));

const ensureDb = (req, res, next) => {
  if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
  next();
};

// AUTH
app.post('/api/auth/register', ensureDb, async (req, res) => {
  try {
    const { name, email, password, shopName } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    const existing = await get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO users (id, name, email, password_hash, shop_name) VALUES ($1, $2, $3, $4, $5)', [id, name, email, hash, shopName || 'My Shop']);
    const token = jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, name, email, shopName: shopName || 'My Shop' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', ensureDb, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, shopName: user.shop_name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', auth, ensureDb, async (req, res) => {
  const user = await get('SELECT id, name, email, shop_name FROM users WHERE id = $1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, shopName: user.shop_name });
});

// CUSTOMERS
app.get('/api/customers', auth, ensureDb, async (req, res) => {
  const { search } = req.query;
  let customers;
  if (search) {
    customers = await all('SELECT * FROM customers WHERE user_id = $1 AND (name ILIKE $2 OR phone ILIKE $2) ORDER BY name', [req.userId, `%${search}%`]);
  } else {
    customers = await all('SELECT * FROM customers WHERE user_id = $1 ORDER BY name', [req.userId]);
  }
  res.json(customers);
});

app.get('/api/customers/:id', auth, ensureDb, async (req, res) => {
  const customer = await get('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const transactions = await all(`
    SELECT s.*, string_agg(p.name, ', ') as product_names
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id
    WHERE s.customer_id = $1 GROUP BY s.id ORDER BY s.sale_date DESC
  `, [req.params.id]);
  const payments = await all('SELECT * FROM customer_payments WHERE customer_id = $1 ORDER BY payment_date DESC', [req.params.id]);
  res.json({ ...customer, transactions, payments });
});

app.post('/api/customers', auth, ensureDb, async (req, res) => {
  try {
    const { name, phone, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    const id = uuidv4();
    await run('INSERT INTO customers (id, user_id, name, phone, address, notes) VALUES ($1, $2, $3, $4, $5, $6)', [id, req.userId, name, phone || '', address || '', notes || '']);
    const customer = await get('SELECT * FROM customers WHERE id = $1', [id]);
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/customers/:id', auth, ensureDb, async (req, res) => {
  try {
    const { name, phone, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    await run('UPDATE customers SET name=$1, phone=$2, address=$3, notes=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 AND user_id=$6', [name, phone || '', address || '', notes || '', req.params.id, req.userId]);
    const customer = await get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/customers/:id', auth, ensureDb, async (req, res) => {
  try {
    await run('DELETE FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CUSTOMER PAYMENTS
app.post('/api/customers/:id/payments', auth, ensureDb, async (req, res) => {
  try {
    const { amount, sale_id, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid payment amount is required' });
    const customer = await get('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (amount > customer.outstanding_dues) return res.status(400).json({ error: 'Payment amount exceeds outstanding dues' });
    await run('INSERT INTO customer_payments (id, customer_id, sale_id, amount, notes) VALUES ($1, $2, $3, $4, $5)', [uuidv4(), req.params.id, sale_id || null, amount, notes || '']);
    await run('UPDATE customers SET total_paid = total_paid + $1, outstanding_dues = outstanding_dues - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, req.params.id]);
    if (sale_id) {
      const sale = await get('SELECT * FROM sales WHERE id = $1', [sale_id]);
      if (sale) {
        await run('UPDATE sales SET amount_paid = amount_paid + $1, due_amount = due_amount - $1 WHERE id = $2', [amount, sale_id]);
        if (sale.order_id) await run('UPDATE orders SET amount_paid = amount_paid + $1, due_amount = due_amount - $1 WHERE id = $2', [amount, sale.order_id]);
      }
    }
    const updated = await get('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PRODUCTS
app.get('/api/products', auth, ensureDb, async (req, res) => {
  const { search, category } = req.query;
  let products;
  if (search) {
    products = await all('SELECT * FROM products WHERE user_id = $1 AND (name ILIKE $2 OR sku ILIKE $2) ORDER BY name', [req.userId, `%${search}%`]);
  } else if (category) {
    products = await all('SELECT * FROM products WHERE user_id = $1 AND category = $2 ORDER BY name', [req.userId, category]);
  } else {
    products = await all('SELECT * FROM products WHERE user_id = $1 ORDER BY name', [req.userId]);
  }
  res.json(products);
});

app.get('/api/products/:id', auth, ensureDb, async (req, res) => {
  const product = await get('SELECT * FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/api/products', auth, ensureDb, async (req, res) => {
  try {
    const { name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    if (actual_price < 0 || selling_price < 0) return res.status(400).json({ error: 'Prices cannot be negative' });
    if (stock < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
    const id = uuidv4();
    await run('INSERT INTO products (id, user_id, name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, req.userId, name, sku || '', category || 'General', actual_price || 0, selling_price || 0, stock || 0, low_stock_threshold || 5, unit || 'pcs', description || '']);
    if (stock <= (low_stock_threshold || 5)) {
      await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${name} is low in stock. Only ${stock} units remaining.`, id, 'product']);
    }
    const product = await get('SELECT * FROM products WHERE id = $1', [id]);
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', auth, ensureDb, async (req, res) => {
  try {
    const { name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    if (actual_price < 0 || selling_price < 0) return res.status(400).json({ error: 'Prices cannot be negative' });
    if (stock < 0) return res.status(400).json({ error: 'Stock cannot be negative' });
    await run('UPDATE products SET name=$1, sku=$2, category=$3, actual_price=$4, selling_price=$5, stock=$6, low_stock_threshold=$7, unit=$8, description=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$10 AND user_id=$11', [name, sku || '', category || 'General', actual_price || 0, selling_price || 0, stock || 0, low_stock_threshold || 5, unit || 'pcs', description || '', req.params.id, req.userId]);
    if (stock <= (low_stock_threshold || 5)) {
      const existing = await get('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, req.params.id, 'low_stock']);
      if (!existing) await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${name} is low in stock. Only ${stock} units remaining.`, req.params.id, 'product']);
    }
    const product = await get('SELECT * FROM products WHERE id = $1', [req.params.id]);
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', auth, ensureDb, async (req, res) => {
  try {
    await run('DELETE FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ message: 'Product deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ORDERS
app.get('/api/orders', auth, ensureDb, async (req, res) => {
  const { status } = req.query;
  let orders;
  const baseQuery = `
    SELECT o.*, c.name as customer_name, c.phone as customer_phone,
      string_agg(p.name || ' (' || oi.quantity || ')', ', ') as items
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.user_id = $1`;
  if (status) {
    orders = await all(`${baseQuery} AND o.status = $2 GROUP BY o.id, c.name, c.phone ORDER BY o.created_at DESC`, [req.userId, status]);
  } else {
    orders = await all(`${baseQuery} GROUP BY o.id, c.name, c.phone ORDER BY o.created_at DESC`, [req.userId]);
  }
  res.json(orders);
});

app.get('/api/orders/:id', auth, ensureDb, async (req, res) => {
  const order = await get(`SELECT o.*, c.name as customer_name, c.phone as customer_phone FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND o.user_id = $2`, [req.params.id, req.userId]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = await all('SELECT oi.*, p.name as product_name, p.stock as current_stock FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1', [req.params.id]);
  res.json({ ...order, items });
});

app.post('/api/orders', auth, ensureDb, async (req, res) => {
  try {
    const { customer_id, items, notes, expected_date, amount_paid } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Order must have at least one item' });
    const orderId = uuidv4();
    let totalAmount = 0;
    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = $1 AND user_id = $2', [item.product_id, req.userId]);
      if (!product) return res.status(400).json({ error: `Product not found` });
      if (item.quantity > product.stock) return res.status(400).json({ error: `Not enough stock for ${product.name}. Only ${product.stock} units available.` });
      totalAmount += product.selling_price * item.quantity;
      await run('INSERT INTO order_items (id, order_id, product_id, quantity, selling_price, actual_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(), orderId, item.product_id, item.quantity, product.selling_price, product.actual_price]);
    }
    const paid = amount_paid || 0;
    await run('INSERT INTO orders (id, user_id, customer_id, notes, expected_date, total_amount, amount_paid, due_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [orderId, req.userId, customer_id || null, notes || '', expected_date || null, totalAmount, paid, totalAmount - paid]);
    const order = await get('SELECT * FROM orders WHERE id = $1', [orderId]);
    res.json(order);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/orders/:id', auth, ensureDb, async (req, res) => {
  try {
    const { status, notes, expected_date } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await run('UPDATE orders SET status=$1, notes=$2, expected_date=$3 WHERE id=$4', [status || order.status, notes || order.notes, expected_date || order.expected_date, req.params.id]);
    const updated = await get('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// COMPLETE ORDER
app.post('/api/orders/:id/complete', auth, ensureDb, async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed') return res.status(400).json({ error: 'Order already completed' });
    const orderItems = await all('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    if (orderItems.length === 0) return res.status(400).json({ error: 'Order has no items' });
    const saleId = uuidv4();
    let totalRevenue = 0, totalCost = 0;
    for (const item of orderItems) {
      const product = await get('SELECT * FROM products WHERE id = $1', [item.product_id]);
      if (!product) return res.status(400).json({ error: `Product not found` });
      if (item.quantity > product.stock) return res.status(400).json({ error: `Not enough stock for ${product.name}. Only ${product.stock} units available.` });
      await run('UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [item.quantity, item.product_id]);
      await run('INSERT INTO sale_items (id, sale_id, product_id, quantity, selling_price, actual_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(), saleId, item.product_id, item.quantity, item.selling_price, item.actual_price]);
      totalRevenue += item.selling_price * item.quantity;
      totalCost += item.actual_price * item.quantity;
      if (product.stock - item.quantity <= product.low_stock_threshold) {
        const existing = await get('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, item.product_id, 'low_stock']);
        if (!existing) await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${product.stock - item.quantity} units remaining.`, item.product_id, 'product']);
      }
    }
    const profit = totalRevenue - totalCost;
    await run('INSERT INTO sales (id, user_id, customer_id, order_id, total_amount, cost_amount, profit, amount_paid, due_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [saleId, req.userId, order.customer_id, req.params.id, totalRevenue, totalCost, profit, order.amount_paid, totalRevenue - order.amount_paid]);
    if (order.customer_id) await run('UPDATE customers SET total_purchases = total_purchases + $1, outstanding_dues = outstanding_dues + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [totalRevenue, totalRevenue - order.amount_paid, order.customer_id]);
    await run('UPDATE orders SET status = $1, completed_date = CURRENT_TIMESTAMP WHERE id = $2', ['completed', req.params.id]);
    await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'sale', 'Sale Completed', `Order completed. Profit: Rs. ${profit.toFixed(2)}`, saleId, 'sale']);
    const sale = await get('SELECT * FROM sales WHERE id = $1', [saleId]);
    res.json(sale);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// DIRECT SALE
app.post('/api/sales', auth, ensureDb, async (req, res) => {
  try {
    const { customer_id, items, amount_paid, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sale must have at least one item' });
    const saleId = uuidv4();
    let totalRevenue = 0, totalCost = 0;
    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = $1 AND user_id = $2', [item.product_id, req.userId]);
      if (!product) return res.status(400).json({ error: `Product not found` });
      if (item.quantity > product.stock) return res.status(400).json({ error: `Not enough stock for ${product.name}. Only ${product.stock} units available.` });
      await run('UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [item.quantity, item.product_id]);
      await run('INSERT INTO sale_items (id, sale_id, product_id, quantity, selling_price, actual_price) VALUES ($1,$2,$3,$4,$5,$6)', [uuidv4(), saleId, item.product_id, item.quantity, product.selling_price, product.actual_price]);
      totalRevenue += product.selling_price * item.quantity;
      totalCost += product.actual_price * item.quantity;
      if (product.stock - item.quantity <= product.low_stock_threshold) {
        const existing = await get('SELECT id FROM notifications WHERE user_id = $1 AND entity_id = $2 AND type = $3 AND read = FALSE', [req.userId, item.product_id, 'low_stock']);
        if (!existing) await run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${product.stock - item.quantity} units remaining.`, item.product_id, 'product']);
      }
    }
    const paid = amount_paid || 0;
    const due = totalRevenue - paid;
    const profit = totalRevenue - totalCost;
    await run('INSERT INTO sales (id, user_id, customer_id, total_amount, cost_amount, profit, amount_paid, due_amount, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [saleId, req.userId, customer_id || null, totalRevenue, totalCost, profit, paid, due, notes || '']);
    if (customer_id) await run('UPDATE customers SET total_purchases = total_purchases + $1, total_paid = total_paid + $2, outstanding_dues = outstanding_dues + $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4', [totalRevenue, paid, due, customer_id]);
    const sale = await get('SELECT * FROM sales WHERE id = $1', [saleId]);
    res.json(sale);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/sales', auth, ensureDb, async (req, res) => {
  const { search, from, to } = req.query;
  let query = `SELECT s.*, c.name as customer_name, c.phone as customer_phone, string_agg(p.name || ' (' || si.quantity || ')', ', ') as items FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id WHERE s.user_id = $1`;
  const params = [req.userId];
  let paramIdx = 2;
  if (search) { query += ` AND (c.name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx} OR s.id::text ILIKE $${paramIdx})`; params.push(`%${search}%`); paramIdx++; }
  if (from) { query += ` AND s.sale_date >= $${paramIdx}`; params.push(from); paramIdx++; }
  if (to) { query += ` AND s.sale_date <= $${paramIdx}`; params.push(to); paramIdx++; }
  query += ` GROUP BY s.id, c.name, c.phone ORDER BY s.sale_date DESC`;
  const sales = await all(query, params);
  res.json(sales);
});

// DASHBOARD
app.get('/api/dashboard', auth, ensureDb, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = await get("SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE user_id = $1 AND date(sale_date) = $2", [req.userId, today]);
    const todayProfit = await get("SELECT COALESCE(SUM(profit), 0) as total FROM sales WHERE user_id = $1 AND date(sale_date) = $2", [req.userId, today]);
    const pendingDues = await get("SELECT COALESCE(SUM(outstanding_dues), 0) as total FROM customers WHERE user_id = $1", [req.userId]);
    const inventoryValue = await get("SELECT COALESCE(SUM(actual_price * stock), 0) as total FROM products WHERE user_id = $1", [req.userId]);
    const lowStockCount = await get("SELECT COUNT(*) as count FROM products WHERE user_id = $1 AND stock <= low_stock_threshold", [req.userId]);
    const upcomingOrders = await get("SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM orders WHERE user_id = $1 AND status = 'upcoming'", [req.userId]);
    const salesLast7 = await all("SELECT date(sale_date) as date, SUM(total_amount) as total FROM sales WHERE user_id = $1 AND sale_date >= NOW() - INTERVAL '7 days' GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const salesLast30 = await all("SELECT date(sale_date) as date, SUM(total_amount) as total FROM sales WHERE user_id = $1 AND sale_date >= NOW() - INTERVAL '30 days' GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const profitLast7 = await all("SELECT date(sale_date) as date, SUM(profit) as total FROM sales WHERE user_id = $1 AND sale_date >= NOW() - INTERVAL '7 days' GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const profitLast30 = await all("SELECT date(sale_date) as date, SUM(profit) as total FROM sales WHERE user_id = $1 AND sale_date >= NOW() - INTERVAL '30 days' GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const recentSales = await all(`SELECT s.*, c.name as customer_name, string_agg(p.name, ', ') as product_names FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products p ON p.id = si.product_id WHERE s.user_id = $1 GROUP BY s.id, c.name ORDER BY s.sale_date DESC LIMIT 5`, [req.userId]);
    const lowStockProducts = await all("SELECT name, stock, low_stock_threshold FROM products WHERE user_id = $1 AND stock <= low_stock_threshold ORDER BY stock ASC", [req.userId]);
    res.json({
      todaySales: todaySales?.total || 0, todayProfit: todayProfit?.total || 0,
      pendingDues: pendingDues?.total || 0, inventoryValue: inventoryValue?.total || 0,
      lowStockCount: lowStockCount?.count || 0, upcomingOrders: upcomingOrders?.count || 0,
      upcomingOrdersValue: upcomingOrders?.total || 0,
      salesLast7, salesLast30, profitLast7, profitLast30, recentSales, lowStockProducts
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PROFIT & LOSS
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NOTIFICATIONS
app.get('/api/notifications', auth, ensureDb, async (req, res) => {
  const notifications = await all('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.userId]);
  res.json(notifications);
});

app.put('/api/notifications/:id/read', auth, ensureDb, async (req, res) => {
  await run('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ message: 'Marked as read' });
});

app.put('/api/notifications/read-all', auth, ensureDb, async (req, res) => {
  await run('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.userId]);
  res.json({ message: 'All marked as read' });
});

// QR DEVICE CONNECTION
app.post('/api/qr/generate', auth, ensureDb, async (req, res) => {
  try {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await run('INSERT INTO qr_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [uuidv4(), req.userId, token, expiresAt]);
    const qrImage = await QRCode.toDataURL(JSON.stringify({ token, userId: req.userId }));
    res.json({ qr: qrImage, token, expiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/qr/connect', ensureDb, async (req, res) => {
  try {
    const { token, deviceName, deviceType } = req.body;
    const qrToken = await get('SELECT * FROM qr_tokens WHERE token = $1 AND used = FALSE', [token]);
    if (!qrToken) return res.status(400).json({ error: 'Invalid or expired QR code' });
    if (new Date(qrToken.expires_at) < new Date()) {
      await run('UPDATE qr_tokens SET used = TRUE WHERE token = $1', [token]);
      return res.status(400).json({ error: 'QR code has expired' });
    }
    await run('UPDATE qr_tokens SET used = TRUE WHERE token = $1', [token]);
    await run('INSERT INTO connected_devices (id, user_id, device_name, device_type) VALUES ($1, $2, $3, $4)', [uuidv4(), qrToken.user_id, deviceName || 'Unknown Device', deviceType || 'unknown']);
    const authToken = jwt.sign({ userId: qrToken.user_id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const user = await get('SELECT id, name, email, shop_name FROM users WHERE id = $1', [qrToken.user_id]);
    res.json({ token: authToken, user: { id: user.id, name: user.name, email: user.email, shopName: user.shop_name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices', auth, ensureDb, async (req, res) => {
  const devices = await all('SELECT * FROM connected_devices WHERE user_id = $1 ORDER BY last_active DESC', [req.userId]);
  res.json(devices);
});

app.delete('/api/devices/:id', auth, ensureDb, async (req, res) => {
  await run('DELETE FROM connected_devices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ message: 'Device disconnected' });
});

app.get('/api/categories', auth, ensureDb, async (req, res) => {
  const categories = await all('SELECT DISTINCT category FROM products WHERE user_id = $1 ORDER BY category', [req.userId]);
  res.json(categories.map(c => c.category));
});

app.put('/api/settings/shop', auth, ensureDb, async (req, res) => {
  try {
    const { shopName } = req.body;
    await run('UPDATE users SET shop_name = $1 WHERE id = $2', [shopName, req.userId]);
    res.json({ message: 'Shop name updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve static frontend
const path = require('path');
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(publicDir, 'index.html'), err => { if (err) res.status(404).send('Not found'); });
});

app.listen(PORT, () => { console.log(`Karobar server running on port ${PORT}`); });
