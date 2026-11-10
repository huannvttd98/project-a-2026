// Nạp dữ liệu mẫu: danh mục, sản phẩm, khách hàng và đơn hàng. Chạy lặp lại an toàn (không tạo trùng).
require('dotenv').config({ quiet: true });
process.env.SEED_DEMO = process.env.SEED_DEMO || '1';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SHOP_PHONE = '0911111111';
const shopUser = db.prepare('SELECT id FROM users WHERE phone=?').get(SHOP_PHONE);
if (!shopUser) { console.error('Chưa có cửa hàng demo (0911111111). Hãy xoá data.sqlite* rồi chạy npm start một lần.'); process.exit(1); }
const shop = db.prepare('SELECT * FROM shops WHERE owner_id=?').get(shopUser.id);

const CATALOG = {
  'Rau lá': [['Xà lách xoăn', 30000, 'kg'], ['Cải xanh', 22000, 'kg'], ['Rau muống', 15000, 'bó'], ['Cải ngọt', 20000, 'kg'], ['Rau dền', 12000, 'bó']],
  'Củ quả': [['Cà chua bi', 45000, 'kg'], ['Cà rốt Đà Lạt', 25000, 'kg'], ['Khoai tây', 28000, 'kg'], ['Bí đỏ', 18000, 'kg'], ['Su su', 16000, 'kg'], ['Dưa leo', 20000, 'kg'], ['Hành tây', 24000, 'kg']],
  'Trái cây': [['Dâu tây', 120000, 'kg'], ['Bơ sáp', 60000, 'kg'], ['Xoài cát Hoà Lộc', 70000, 'kg'], ['Cam sành', 35000, 'kg'], ['Thanh long ruột đỏ', 40000, 'kg'], ['Chuối tiêu', 25000, 'nải']],
  'Gạo & ngũ cốc': [['Gạo ST25', 28000, 'kg'], ['Gạo lứt đỏ', 32000, 'kg'], ['Đậu xanh', 45000, 'kg'], ['Hạt sen khô', 180000, 'kg']],
  'Trứng & sữa': [['Trứng gà ta', 4000, 'quả'], ['Trứng vịt', 3500, 'quả'], ['Trứng cút', 1000, 'quả']],
  'Nấm': [['Nấm rơm', 90000, 'kg'], ['Nấm bào ngư', 70000, 'kg'], ['Nấm hương tươi', 150000, 'kg']],
  'Gia vị & thảo mộc': [['Gừng', 40000, 'kg'], ['Sả', 15000, 'bó'], ['Ớt hiểm', 60000, 'kg'], ['Tỏi Lý Sơn', 90000, 'kg']],
};

const findP = db.prepare('SELECT id FROM products WHERE shop_id=? AND name=?');
const insP = db.prepare('INSERT INTO products (shop_id,name,price,unit,category,available) VALUES (?,?,?,?,?,?)');
const updCat = db.prepare('UPDATE products SET category=? WHERE id=?');
let added = 0;
for (const [cat, items] of Object.entries(CATALOG)) {
  for (const [name, price, unit] of items) {
    const ex = findP.get(shop.id, name);
    if (ex) { updCat.run(cat, ex.id); continue; }
    // một vài sản phẩm hết hàng để thấy trạng thái "Hết hàng"
    insP.run(shop.id, name, price, unit, cat, ['Dâu tây', 'Hạt sen khô'].includes(name) ? 0 : 1);
    added++;
  }
}
db.prepare("UPDATE products SET category='Trứng & sữa' WHERE shop_id=? AND category='Khác'").run(shop.id);
Object.keys(CATALOG).forEach((name, i) => {
  db.prepare('INSERT OR IGNORE INTO categories (shop_id,name,sort_order) VALUES (?,?,?)').run(shop.id, name, i);
  db.prepare('UPDATE categories SET sort_order=? WHERE shop_id=? AND name=?').run(i, shop.id, name);
});

const CUSTOMERS = [
  ['0944444441', 'Nguyễn Văn An', '25 Trần Phú, Đà Lạt'],
  ['0944444442', 'Trần Thị Bình', '8 Nguyễn Văn Cừ, Q.5, TP.HCM'],
  ['0944444443', 'Lê Hoàng Cường', '102 Lê Lợi, Hải Châu, Đà Nẵng'],
  ['0944444444', 'Phạm Thu Dung', '15 Hai Bà Trưng, Hoàn Kiếm, Hà Nội'],
];
const hash = bcrypt.hashSync('Test12345', 10);
const custIds = CUSTOMERS.map(([phone, name]) => {
  const ex = db.prepare('SELECT id FROM users WHERE phone=?').get(phone);
  if (ex) return ex.id;
  return db.prepare("INSERT INTO users (phone,password_hash,role,name) VALUES (?,?, 'customer',?)").run(phone, hash, name).lastInsertRowid;
});

let ordersAdded = 0;
if (!db.prepare('SELECT 1 FROM orders WHERE customer_id=?').get(custIds[0])) {
  const prods = db.prepare('SELECT id,name,price FROM products WHERE shop_id=? AND available=1 AND price_pending=0').all(shop.id);
  const pick = n => [...prods].sort(() => Math.random() - 0.5).slice(0, n);
  const statuses = ['done', 'done', 'done', 'done', 'done', 'delivering', 'delivering', 'preparing', 'new', 'new', 'cancelled', 'done'];
  const insO = db.prepare(`INSERT INTO orders (public_code,shop_id,customer_id,customer_name,phone,address,note,total,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now', ?))`);
  const insI = db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)');
  const notes = ['', 'Giao giờ hành chính', 'Gọi trước khi giao', '', 'Chọn hàng tươi giúp mình'];
  db.transaction(() => {
    statuses.forEach((st, i) => {
      const c = i % CUSTOMERS.length;
      const lines = pick(2 + (i % 3)).map(p => [p, [0.5, 1, 1.5, 2, 3][(i + p.id) % 5]]);
      const total = lines.reduce((s, [p, q]) => s + Math.round(p.price * q), 0);
      const daysAgo = st === 'new' ? 0 : st === 'preparing' || st === 'delivering' ? 0 : 1 + (i % 6);
      const r = insO.run(crypto.randomUUID(), shop.id, custIds[c], CUSTOMERS[c][1], CUSTOMERS[c][0], CUSTOMERS[c][2],
        notes[i % notes.length], total, st, `-${daysAgo} days`);
      lines.forEach(([p, q]) => insI.run(r.lastInsertRowid, p.id, p.name, p.price, q));
      ordersAdded++;
    });
  })();
}

const cats = db.prepare('SELECT category, COUNT(*) n FROM products WHERE shop_id=? GROUP BY category ORDER BY category').all(shop.id);
console.log(`Đã thêm ${added} sản phẩm, ${ordersAdded} đơn hàng, ${CUSTOMERS.length} khách (mật khẩu Test12345).`);
console.log('Danh mục:', cats.map(c => `${c.category} (${c.n})`).join(', '));
