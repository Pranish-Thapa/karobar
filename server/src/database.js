const { Pool } = require('pg');

let pool = null;

async function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is not set');
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  await initTables();
  return pool;
}

async function initTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, shop_name TEXT DEFAULT 'My Shop',
        language TEXT DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'`).catch(() => {});
    await client.query(`
      CREATE TABLE IF NOT EXISTS qr_tokens (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS connected_devices (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_name TEXT NOT NULL,
        device_type TEXT NOT NULL, last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
        phone TEXT, address TEXT, notes TEXT,
        total_purchases NUMERIC DEFAULT 0, total_paid NUMERIC DEFAULT 0,
        outstanding_dues NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
        sku TEXT, category TEXT DEFAULT 'General',
        actual_price NUMERIC NOT NULL DEFAULT 0, selling_price NUMERIC NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0, low_stock_threshold INTEGER DEFAULT 5,
        unit TEXT DEFAULT 'pcs', description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, customer_id TEXT,
        status TEXT DEFAULT 'upcoming', order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expected_date TIMESTAMP, completed_date TIMESTAMP, notes TEXT,
        total_amount NUMERIC DEFAULT 0, amount_paid NUMERIC DEFAULT 0, due_amount NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL, selling_price NUMERIC NOT NULL, actual_price NUMERIC NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, customer_id TEXT, order_id TEXT,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_amount NUMERIC NOT NULL DEFAULT 0, cost_amount NUMERIC NOT NULL DEFAULT 0,
        profit NUMERIC NOT NULL DEFAULT 0, amount_paid NUMERIC DEFAULT 0,
        due_amount NUMERIC DEFAULT 0, notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL, selling_price NUMERIC NOT NULL, actual_price NUMERIC NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, sale_id TEXT,
        amount NUMERIC NOT NULL, payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
        title TEXT NOT NULL, message TEXT NOT NULL, read BOOLEAN DEFAULT FALSE,
        entity_id TEXT, entity_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sale_id TEXT NOT NULL,
        customer_id TEXT, product_id TEXT NOT NULL, quantity INTEGER NOT NULL,
        reason TEXT, refund_amount NUMERIC NOT NULL DEFAULT 0,
        return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'completed',
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT NOT NULL,
        adjustment INTEGER NOT NULL, reason TEXT NOT NULL,
        previous_stock INTEGER NOT NULL, new_stock INTEGER NOT NULL,
        adjusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS business_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        shop_name TEXT DEFAULT '',
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        website TEXT DEFAULT '',
        pan TEXT DEFAULT '',
        vat_number TEXT DEFAULT '',
        logo_url TEXT DEFAULT '',
        stamp_url TEXT DEFAULT '',
        bill_language TEXT DEFAULT 'en',
        bill_paper_size TEXT DEFAULT 'A4',
        bill_type TEXT DEFAULT 'commercial',
        vat_rate NUMERIC DEFAULT 13,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sale_id TEXT NOT NULL,
        invoice_number INTEGER NOT NULL,
        invoice_type TEXT DEFAULT 'commercial',
        bill_language TEXT DEFAULT 'en',
        paper_size TEXT DEFAULT 'A4',
        business_snapshot JSONB DEFAULT '{}',
        customer_snapshot JSONB DEFAULT '{}',
        items_snapshot JSONB DEFAULT '[]',
        total_amount NUMERIC NOT NULL DEFAULT 0,
        discount NUMERIC DEFAULT 0,
        vat_rate NUMERIC DEFAULT 0,
        vat_amount NUMERIC DEFAULT 0,
        net_amount NUMERIC NOT NULL DEFAULT 0,
        amount_paid NUMERIC DEFAULT 0,
        due_amount NUMERIC DEFAULT 0,
        payment_method TEXT DEFAULT 'cash',
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      )
    `);

    // Indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_customers_user_name ON customers(user_id, name)',
      'CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_user_category ON products(user_id, category)',
      'CREATE INDEX IF NOT EXISTS idx_products_user_name ON products(user_id, name)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_sales_user_date ON sales(user_id, sale_date)',
      'CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)',
      'CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_entity ON notifications(user_id, entity_id, type, read)',
      'CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_returns_product ON returns(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id)',
      'CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_user ON inventory_adjustments(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product ON inventory_adjustments(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_user_sku ON products(user_id, sku)',
      'CREATE INDEX IF NOT EXISTS idx_qr_tokens_user ON qr_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_connected_devices_user ON connected_devices(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_sale ON invoices(sale_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(user_id, invoice_number)',
      'CREATE INDEX IF NOT EXISTS idx_business_settings_user ON business_settings(user_id)',
    ];
    for (const idx of indexes) {
      await client.query(idx);
    }

    // Migrations
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMP`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT FALSE`).catch(() => {});

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || undefined;
}

async function run(sql, params = []) {
  return await pool.query(sql, params);
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, all, get, run, transaction };
