const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','shop','customer')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  zalo TEXT NOT NULL DEFAULT '',
  open_hours TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','suspended'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  unit TEXT NOT NULL DEFAULT 'kg',
  category TEXT NOT NULL DEFAULT 'Khác',
  image TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS product_images (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  data BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_code TEXT NOT NULL UNIQUE,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','delivering','done','cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'cod',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shop_id, name)
);
`);

function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}
addColumn('shops', 'accepting_orders', 'INTEGER NOT NULL DEFAULT 1');
addColumn('shops', 'min_order', 'INTEGER NOT NULL DEFAULT 0');
addColumn('shops', 'prep_minutes', 'INTEGER NOT NULL DEFAULT 30');
addColumn('orders', 'deliver_at', 'TEXT');
addColumn('products', 'price_pending', 'INTEGER NOT NULL DEFAULT 0 CHECK (price_pending IN (0,1))');
addColumn('order_items', 'price_pending', 'INTEGER NOT NULL DEFAULT 0 CHECK (price_pending IN (0,1))');

// Tạo danh mục cho các sản phẩm đã có (dữ liệu cũ)
function backfillCategories() {
  db.exec(`INSERT OR IGNORE INTO categories (shop_id,name,sort_order)
    SELECT shop_id, category, MIN(id) FROM products GROUP BY shop_id, category`);
}
backfillCategories();

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  const adminPhone = process.env.ADMIN_PHONE || '0900000000';
  const generated = !process.env.ADMIN_PASSWORD;
  const adminPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare("INSERT INTO users (phone,password_hash,role,name) VALUES (?,?, 'admin','Quản trị viên')")
    .run(adminPhone, bcrypt.hashSync(adminPass, 10));
  console.log(`[seed] Admin: ${adminPhone}` + (generated ? ` / mật khẩu: ${adminPass} (chỉ hiện một lần)` : ''));

  if (process.env.SEED_DEMO === '0') return;
  const hash = bcrypt.hashSync('Test12345', 10);
  db.prepare("INSERT INTO users (phone,password_hash,role,name) VALUES (?,?, 'customer',?)")
    .run('0922222222', hash, 'Khách Test');
  db.prepare("INSERT INTO users (phone,password_hash,role,name) VALUES (?,?, 'admin','Admin Test')")
    .run('0933333333', hash);
  console.log('[seed] Test admin: 0933333333 / Test12345 — Test cửa hàng: 0911111111 / Test12345 — Test khách: 0922222222 / Test12345');
  const u =  db.prepare("INSERT INTO users (phone,password_hash,role,name) VALUES (?,?, 'shop',?)")
    .run('0911111111', hash, 'Chị Lan');
  const s = db.prepare(`INSERT INTO shops (owner_id,name,slug,description,address,contact_phone,zalo,open_hours)
    VALUES (?,?,?,?,?,?,?,?)`).run(u.lastInsertRowid, 'Nông sản Vườn Xanh', 'vuon-xanh-demo',
    'Rau củ quả sạch, thu hoạch trong ngày từ Đà Lạt.', 'Đà Lạt, Lâm Đồng', '0911111111', '0911111111', '6:00 - 20:00');
  const p = db.prepare('INSERT INTO products (shop_id,name,price,unit,category) VALUES (?,?,?,?,?)');
  [['Cà chua bi', 45000, 'kg', 'Rau củ'], ['Xà lách xoăn', 30000, 'kg', 'Rau củ'],
   ['Cà rốt Đà Lạt', 25000, 'kg', 'Rau củ'], ['Dâu tây', 120000, 'kg', 'Trái cây'],
   ['Bơ sáp', 60000, 'kg', 'Trái cây'], ['Gạo ST25', 28000, 'kg', 'Gạo & hạt'],
   ['Trứng gà ta', 4000, 'quả', 'Khác']]
    .forEach(([n, pr, un, c]) => p.run(s.lastInsertRowid, n, pr, un, c));
  backfillCategories();
}
seed();

module.exports = db;
