require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { getDb, all, get, run, saveDb } = require('./database');

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

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    await getDb();
    const { name, email, password, shopName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const existing = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (id, name, email, password_hash, shop_name) VALUES (?, ?, ?, ?, ?)', [id, name, email, hash, shopName || 'My Shop']);

    const token = jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, name, email, shopName: shopName || 'My Shop' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await getDb();
    const { email, password } = req.body;
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, shopName: user.shop_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  await getDb();
  const user = get('SELECT id, name, email, shop_name FROM users WHERE id = ?', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, shopName: user.shop_name });
});

// CUSTOMERS
app.get('/api/customers', auth, async (req, res) => {
  await getDb();
  const { search } = req.query;
  let customers;
  if (search) {
    customers = all('SELECT * FROM customers WHERE user_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name', [req.userId, `%${search}%`, `%${search}%`]);
  } else {
    customers = all('SELECT * FROM customers WHERE user_id = ? ORDER BY name', [req.userId]);
  }
  res.json(customers);
});

app.get('/api/customers/:id', auth, async (req, res) => {
  await getDb();
  const customer = get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const transactions = all(`
    SELECT s.*, GROUP_CONCAT(p.name, ', ') as product_names
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.customer_id = ?
    GROUP BY s.id
    ORDER BY s.sale_date DESC
  `, [req.params.id]);
  const payments = all('SELECT * FROM customer_payments WHERE customer_id = ? ORDER BY payment_date DESC', [req.params.id]);
  res.json({ ...customer, transactions, payments });
});

app.post('/api/customers', auth, async (req, res) => {
  try {
    await getDb();
    const { name, phone, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    const id = uuidv4();
    run('INSERT INTO customers (id, user_id, name, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)', [id, req.userId, name, phone || '', address || '', notes || '']);
    const customer = get('SELECT * FROM customers WHERE id = ?', [id]);
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    await getDb();
    const { name, phone, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    run('UPDATE customers SET name=?, phone=?, address=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?', [name, phone || '', address || '', notes || '', req.params.id, req.userId]);
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', auth, async (req, res) => {
  try {
    await getDb();
    run('DELETE FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CUSTOMER PAYMENTS
app.post('/api/customers/:id/payments', auth, async (req, res) => {
  try {
    await getDb();
    const { amount, sale_id, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid payment amount is required' });

    const customer = get('SELECT * FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (amount > customer.outstanding_dues) return res.status(400).json({ error: 'Payment amount exceeds outstanding dues' });

    const paymentId = uuidv4();
    run('INSERT INTO customer_payments (id, customer_id, sale_id, amount, notes) VALUES (?, ?, ?, ?, ?)', [paymentId, req.params.id, sale_id || null, amount, notes || '']);
    run('UPDATE customers SET total_paid = total_paid + ?, outstanding_dues = outstanding_dues - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, amount, req.params.id]);

    if (sale_id) {
      const sale = get('SELECT * FROM sales WHERE id = ?', [sale_id]);
      if (sale) {
        run('UPDATE sales SET amount_paid = amount_paid + ?, due_amount = due_amount - ? WHERE id = ?', [amount, amount, sale_id]);
        if (sale.order_id) {
          run('UPDATE orders SET amount_paid = amount_paid + ?, due_amount = due_amount - ? WHERE id = ?', [amount, amount, sale.order_id]);
        }
      }
    }

    const updated = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PRODUCTS
app.get('/api/products', auth, async (req, res) => {
  await getDb();
  const { search, category } = req.query;
  let products;
  if (search) {
    products = all('SELECT * FROM products WHERE user_id = ? AND (name LIKE ? OR sku LIKE ?) ORDER BY name', [req.userId, `%${search}%`, `%${search}%`]);
  } else if (category) {
    products = all('SELECT * FROM products WHERE user_id = ? AND category = ? ORDER BY name', [req.userId, category]);
  } else {
    products = all('SELECT * FROM products WHERE user_id = ? ORDER BY name', [req.userId]);
  }
  res.json(products);
});

app.get('/api/products/:id', auth, async (req, res) => {
  await getDb();
  const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/api/products', auth, async (req, res) => {
  try {
    await getDb();
    const { name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    if (actual_price < 0 || selling_price < 0) return res.status(400).json({ error: 'Prices cannot be negative' });
    if (stock < 0) return res.status(400).json({ error: 'Stock cannot be negative' });

    const id = uuidv4();
    run('INSERT INTO products (id, user_id, name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, req.userId, name, sku || '', category || 'General', actual_price || 0, selling_price || 0, stock || 0, low_stock_threshold || 5, unit || 'pcs', description || '']);

    if (stock <= (low_stock_threshold || 5)) {
      run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${name} is low in stock. Only ${stock} units remaining.`, id, 'product']);
    }

    const product = get('SELECT * FROM products WHERE id = ?', [id]);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', auth, async (req, res) => {
  try {
    await getDb();
    const { name, sku, category, actual_price, selling_price, stock, low_stock_threshold, unit, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });
    if (actual_price < 0 || selling_price < 0) return res.status(400).json({ error: 'Prices cannot be negative' });
    if (stock < 0) return res.status(400).json({ error: 'Stock cannot be negative' });

    run('UPDATE products SET name=?, sku=?, category=?, actual_price=?, selling_price=?, stock=?, low_stock_threshold=?, unit=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?', [name, sku || '', category || 'General', actual_price || 0, selling_price || 0, stock || 0, low_stock_threshold || 5, unit || 'pcs', description || '', req.params.id, req.userId]);

    if (stock <= (low_stock_threshold || 5)) {
      const existing = get('SELECT id FROM notifications WHERE user_id = ? AND entity_id = ? AND type = ? AND read = 0', [req.userId, req.params.id, 'low_stock']);
      if (!existing) {
        run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${name} is low in stock. Only ${stock} units remaining.`, req.params.id, 'product']);
      }
    }

    const product = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    await getDb();
    run('DELETE FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ORDERS
app.get('/api/orders', auth, async (req, res) => {
  await getDb();
  const { status } = req.query;
  let orders;
  if (status) {
    orders = all(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone,
        GROUP_CONCAT(p.name || ' (' || oi.quantity || ')', ', ') as items
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ? AND o.status = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.userId, status]);
  } else {
    orders = all(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone,
        GROUP_CONCAT(p.name || ' (' || oi.quantity || ')', ', ') as items
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.userId]);
  }
  res.json(orders);
});

app.get('/api/orders/:id', auth, async (req, res) => {
  await getDb();
  const order = get(`
    SELECT o.*, c.name as customer_name, c.phone as customer_phone
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.id = ? AND o.user_id = ?
  `, [req.params.id, req.userId]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = all(`
    SELECT oi.*, p.name as product_name, p.stock as current_stock
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `, [req.params.id]);

  res.json({ ...order, items });
});

app.post('/api/orders', auth, async (req, res) => {
  try {
    await getDb();
    const { customer_id, items, notes, expected_date, amount_paid } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Order must have at least one item' });

    const orderId = uuidv4();
    let totalAmount = 0;

    for (const item of items) {
      const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [item.product_id, req.userId]);
      if (!product) return res.status(400).json({ error: `Product not found: ${item.product_id}` });
      if (item.quantity > product.stock) return res.status(400).json({ error: `Not enough stock for ${product.name}. Only ${product.stock} units available.` });

      const itemTotal = product.selling_price * item.quantity;
      totalAmount += itemTotal;

      run('INSERT INTO order_items (id, order_id, product_id, quantity, selling_price, actual_price) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), orderId, item.product_id, item.quantity, product.selling_price, product.actual_price]);
    }

    const paid = amount_paid || 0;
    run('INSERT INTO orders (id, user_id, customer_id, notes, expected_date, total_amount, amount_paid, due_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [orderId, req.userId, customer_id || null, notes || '', expected_date || null, totalAmount, paid, totalAmount - paid]);

    const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/orders/:id', auth, async (req, res) => {
  try {
    await getDb();
    const { status, notes, expected_date } = req.body;
    const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    run('UPDATE orders SET status=?, notes=?, expected_date=? WHERE id=?', [status || order.status, notes || order.notes, expected_date || order.expected_date, req.params.id]);

    const updated = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// COMPLETE ORDER
app.post('/api/orders/:id/complete', auth, async (req, res) => {
  try {
    await getDb();
    const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed') return res.status(400).json({ error: 'Order already completed' });

    const orderItems = all('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
    if (orderItems.length === 0) return res.status(400).json({ error: 'Order has no items' });

    const saleId = uuidv4();
    let totalRevenue = 0;
    let totalCost = 0;

    for (const item of orderItems) {
      const product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) return res.status(400).json({ error: `Product not found: ${item.product_id}` });
      if (item.quantity > product.stock) return res.status(400).json({ error: `Not enough stock for ${product.name}. Only ${product.stock} units available.` });

      run('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, item.product_id]);
      run('INSERT INTO sale_items (id, sale_id, product_id, quantity, selling_price, actual_price) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), saleId, item.product_id, item.quantity, item.selling_price, item.actual_price]);

      totalRevenue += item.selling_price * item.quantity;
      totalCost += item.actual_price * item.quantity;

      if (product.stock - item.quantity <= product.low_stock_threshold) {
        const existing = get('SELECT id FROM notifications WHERE user_id = ? AND entity_id = ? AND type = ? AND read = 0', [req.userId, item.product_id, 'low_stock']);
        if (!existing) {
          run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${product.stock - item.quantity} units remaining.`, item.product_id, 'product']);
        }
      }
    }

    const profit = totalRevenue - totalCost;
    run('INSERT INTO sales (id, user_id, customer_id, order_id, total_amount, cost_amount, profit, amount_paid, due_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [saleId, req.userId, order.customer_id, req.params.id, totalRevenue, totalCost, profit, order.amount_paid, totalRevenue - order.amount_paid]);

    if (order.customer_id) {
      run('UPDATE customers SET total_purchases = total_purchases + ?, outstanding_dues = outstanding_dues + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalRevenue, totalRevenue - order.amount_paid, order.customer_id]);
    }

    run('UPDATE orders SET status = ?, completed_date = CURRENT_TIMESTAMP WHERE id = ?', ['completed', req.params.id]);

    run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidv4(), req.userId, 'sale', 'Sale Completed', `Order completed. Profit: Rs. ${profit.toFixed(2)}`, saleId, 'sale']);

    const sale = get('SELECT * FROM sales WHERE id = ?', [saleId]);
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DIRECT SALE
app.post('/api/sales', auth, async (req, res) => {
  try {
    await getDb();
    const { customer_id, items, amount_paid, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sale must have at least one item' });

    const saleId = uuidv4();
    let totalRevenue = 0;
    let totalCost = 0;

    for (const item of items) {
      const product = get('SELECT * FROM products WHERE id = ? AND user_id = ?', [item.product_id, req.userId]);
      if (!product) return res.status(400).json({ error: `Product not found: ${item.product_id}` });
      if (item.quantity > product.stock) return res.status(400).json({ error: `Not enough stock for ${product.name}. Only ${product.stock} units available.` });

      run('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, item.product_id]);
      run('INSERT INTO sale_items (id, sale_id, product_id, quantity, selling_price, actual_price) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), saleId, item.product_id, item.quantity, product.selling_price, product.actual_price]);

      totalRevenue += product.selling_price * item.quantity;
      totalCost += product.actual_price * item.quantity;

      if (product.stock - item.quantity <= product.low_stock_threshold) {
        const existing = get('SELECT id FROM notifications WHERE user_id = ? AND entity_id = ? AND type = ? AND read = 0', [req.userId, item.product_id, 'low_stock']);
        if (!existing) {
          run('INSERT INTO notifications (id, user_id, type, title, message, entity_id, entity_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuidv4(), req.userId, 'low_stock', 'Low Stock Alert', `${product.name} is low in stock. Only ${product.stock - item.quantity} units remaining.`, item.product_id, 'product']);
        }
      }
    }

    const paid = amount_paid || 0;
    const due = totalRevenue - paid;
    const profit = totalRevenue - totalCost;

    run('INSERT INTO sales (id, user_id, customer_id, total_amount, cost_amount, profit, amount_paid, due_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [saleId, req.userId, customer_id || null, totalRevenue, totalCost, profit, paid, due, notes || '']);

    if (customer_id) {
      run('UPDATE customers SET total_purchases = total_purchases + ?, total_paid = total_paid + ?, outstanding_dues = outstanding_dues + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalRevenue, paid, due, customer_id]);
    }

    const sale = get('SELECT * FROM sales WHERE id = ?', [saleId]);
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/sales', auth, async (req, res) => {
  await getDb();
  const { search, from, to } = req.query;
  let query = `
    SELECT s.*, c.name as customer_name, c.phone as customer_phone,
      GROUP_CONCAT(p.name || ' (' || si.quantity || ')', ', ') as items
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.user_id = ?
  `;
  const params = [req.userId];

  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR s.id LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (from) {
    query += ` AND s.sale_date >= ?`;
    params.push(from);
  }
  if (to) {
    query += ` AND s.sale_date <= ?`;
    params.push(to);
  }

  query += ` GROUP BY s.id ORDER BY s.sale_date DESC`;

  const sales = all(query, params);
  res.json(sales);
});

// DASHBOARD
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    await getDb();
    const today = new Date().toISOString().split('T')[0];

    const todaySales = get("SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE user_id = ? AND date(sale_date) = date(?)", [req.userId, today]);
    const todayProfit = get("SELECT COALESCE(SUM(profit), 0) as total FROM sales WHERE user_id = ? AND date(sale_date) = date(?)", [req.userId, today]);
    const pendingDues = get("SELECT COALESCE(SUM(outstanding_dues), 0) as total FROM customers WHERE user_id = ?", [req.userId]);
    const inventoryValue = get("SELECT COALESCE(SUM(actual_price * stock), 0) as total FROM products WHERE user_id = ?", [req.userId]);
    const lowStockCount = get("SELECT COUNT(*) as count FROM products WHERE user_id = ? AND stock <= low_stock_threshold", [req.userId]);
    const upcomingOrders = get("SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM orders WHERE user_id = ? AND status = 'upcoming'", [req.userId]);

    const salesLast7 = all("SELECT date(sale_date) as date, SUM(total_amount) as total FROM sales WHERE user_id = ? AND sale_date >= datetime('now', '-7 days') GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const salesLast30 = all("SELECT date(sale_date) as date, SUM(total_amount) as total FROM sales WHERE user_id = ? AND sale_date >= datetime('now', '-30 days') GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const profitLast7 = all("SELECT date(sale_date) as date, SUM(profit) as total FROM sales WHERE user_id = ? AND sale_date >= datetime('now', '-7 days') GROUP BY date(sale_date) ORDER BY date", [req.userId]);
    const profitLast30 = all("SELECT date(sale_date) as date, SUM(profit) as total FROM sales WHERE user_id = ? AND sale_date >= datetime('now', '-30 days') GROUP BY date(sale_date) ORDER BY date", [req.userId]);

    const recentSales = all(`
      SELECT s.*, c.name as customer_name,
        GROUP_CONCAT(p.name, ', ') as product_names
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.sale_date DESC LIMIT 5
    `, [req.userId]);

    const lowStockProducts = all("SELECT name, stock, low_stock_threshold FROM products WHERE user_id = ? AND stock <= low_stock_threshold ORDER BY stock ASC", [req.userId]);

    res.json({
      todaySales: todaySales?.total || 0,
      todayProfit: todayProfit?.total || 0,
      pendingDues: pendingDues?.total || 0,
      inventoryValue: inventoryValue?.total || 0,
      lowStockCount: lowStockCount?.count || 0,
      upcomingOrders: upcomingOrders?.count || 0,
      upcomingOrdersValue: upcomingOrders?.total || 0,
      salesLast7, salesLast30, profitLast7, profitLast30,
      recentSales, lowStockProducts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PROFIT & LOSS
app.get('/api/profit-loss', auth, async (req, res) => {
  try {
    await getDb();
    const { period, from, to } = req.query;
    let dateFilter = '';
    const params = [req.userId];

    const today = new Date().toISOString().split('T')[0];
    if (period === 'today') {
      dateFilter = "AND date(s.sale_date) = date(?)";
      params.push(today);
    } else if (period === '7days') {
      dateFilter = "AND s.sale_date >= datetime('now', '-7 days')";
    } else if (period === '30days') {
      dateFilter = "AND s.sale_date >= datetime('now', '-30 days')";
    } else if (period === '90days') {
      dateFilter = "AND s.sale_date >= datetime('now', '-90 days')";
    } else if (from && to) {
      dateFilter = "AND s.sale_date >= ? AND s.sale_date <= ?";
      params.push(from, to);
    }

    const summary = get(`
      SELECT
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COALESCE(SUM(s.cost_amount), 0) as total_cost,
        COALESCE(SUM(s.profit), 0) as total_profit,
        COUNT(*) as sale_count,
        COALESCE(SUM(s.amount_paid), 0) as amount_received,
        COALESCE(SUM(s.due_amount), 0) as outstanding_dues
      FROM sales s
      WHERE s.user_id = ? ${dateFilter}
    `, params);

    const avgProfit = summary && summary.sale_count > 0 ? summary.total_profit / summary.sale_count : 0;

    const mostProfitableSale = get(`
      SELECT s.*, c.name as customer_name,
        GROUP_CONCAT(p.name || ' (' || si.quantity || ')', ', ') as items
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.user_id = ? ${dateFilter}
      GROUP BY s.id
      ORDER BY s.profit DESC
      LIMIT 1
    `, params);

    const profitableProducts = all(`
      SELECT p.name, SUM(si.quantity) as units_sold,
        SUM(si.selling_price * si.quantity) as revenue,
        SUM(si.actual_price * si.quantity) as cost,
        SUM((si.selling_price - si.actual_price) * si.quantity) as profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.user_id = ? ${dateFilter}
      GROUP BY p.id
      ORDER BY profit DESC
    `, params);

    const topDuesCustomers = all(`
      SELECT name, outstanding_dues FROM customers WHERE user_id = ? AND outstanding_dues > 0 ORDER BY outstanding_dues DESC
    `, [req.userId]);

    res.json({
      summary: { ...summary, avg_profit: avgProfit },
      mostProfitableSale,
      profitableProducts,
      topDuesCustomers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTIFICATIONS
app.get('/api/notifications', auth, async (req, res) => {
  await getDb();
  const notifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.userId]);
  res.json(notifications);
});

app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await getDb();
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  res.json({ message: 'Marked as read' });
});

app.put('/api/notifications/read-all', auth, async (req, res) => {
  await getDb();
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.userId]);
  res.json({ message: 'All marked as read' });
});

// QR DEVICE CONNECTION
app.post('/api/qr/generate', auth, async (req, res) => {
  try {
    await getDb();
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    run('INSERT INTO qr_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)', [uuidv4(), req.userId, token, expiresAt]);

    const qrData = JSON.stringify({ token, userId: req.userId });
    const qrImage = await QRCode.toDataURL(qrData);

    res.json({ qr: qrImage, token, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/qr/connect', async (req, res) => {
  try {
    await getDb();
    const { token, deviceName, deviceType } = req.body;
    const qrToken = get('SELECT * FROM qr_tokens WHERE token = ? AND used = 0', [token]);

    if (!qrToken) return res.status(400).json({ error: 'Invalid or expired QR code' });
    if (new Date(qrToken.expires_at) < new Date()) {
      run('UPDATE qr_tokens SET used = 1 WHERE token = ?', [token]);
      return res.status(400).json({ error: 'QR code has expired. Please generate a new one.' });
    }

    run('UPDATE qr_tokens SET used = 1 WHERE token = ?', [token]);

    const deviceId = uuidv4();
    run('INSERT INTO connected_devices (id, user_id, device_name, device_type) VALUES (?, ?, ?, ?)', [deviceId, qrToken.user_id, deviceName || 'Unknown Device', deviceType || 'unknown']);

    const authToken = jwt.sign({ userId: qrToken.user_id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    const user = get('SELECT id, name, email, shop_name FROM users WHERE id = ?', [qrToken.user_id]);

    res.json({ token: authToken, user: { id: user.id, name: user.name, email: user.email, shopName: user.shop_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/devices', auth, async (req, res) => {
  await getDb();
  const devices = all('SELECT * FROM connected_devices WHERE user_id = ? ORDER BY last_active DESC', [req.userId]);
  res.json(devices);
});

app.delete('/api/devices/:id', auth, async (req, res) => {
  await getDb();
  run('DELETE FROM connected_devices WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  res.json({ message: 'Device disconnected' });
});

// CATEGORIES
app.get('/api/categories', auth, async (req, res) => {
  await getDb();
  const categories = all('SELECT DISTINCT category FROM products WHERE user_id = ? ORDER BY category', [req.userId]);
  res.json(categories.map(c => c.category));
});

// SETTINGS
app.put('/api/settings/shop', auth, async (req, res) => {
  try {
    await getDb();
    const { shopName } = req.body;
    run('UPDATE users SET shop_name = ? WHERE id = ?', [shopName, req.userId]);
    res.json({ message: 'Shop name updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend
const path = require('path');
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallback - serve index.html for non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'), err => {
    if (err) res.status(404).send('Not found');
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Karobar server running on port ${PORT}`);
});
