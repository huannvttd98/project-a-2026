require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { z } = require('zod');
const { Server } = require('socket.io');
const db = require('./db');

const PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const app = express();
const server = http.createServer(app);
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '10kb' }));

const sessionMw = session({
  name: 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 7 * 24 * 3600 * 1000 },
});
app.use(sessionMw);

// Chống CSRF: yêu cầu header tuỳ chỉnh cho mọi request ghi (trình duyệt chặn cross-site nếu không có CORS)
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'Yêu cầu không hợp lệ' });
  next();
});

// ---------- helpers ----------
const PHONE_RE = /^0\d{9,10}$/;
const httpsUrl = z.string().max(500).refine(v => v === '' || /^https:\/\/[^\s]+$/.test(v), 'URL ảnh phải bắt đầu bằng https://');
const phoneSchema = z.string().regex(PHONE_RE, 'Số điện thoại không hợp lệ');
const passSchema = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(100);
const str = (max, min = 1) => z.string().trim().min(min).max(max);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validate = (schema, data) => {
  const r = schema.safeParse(data);
  if (!r.success) {
    const e = new Error(r.error.issues[0].message);
    e.status = 400;
    throw e;
  }
  return r.data;
};
const fail = (status, msg) => Object.assign(new Error(msg), { status });

const limiter = (max, windowMin) => rateLimit({
  windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
});

const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

function slugify(name) {
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shop';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

const getUser = id => db.prepare('SELECT id,phone,role,name,status FROM users WHERE id=?').get(id);
const getShopByOwner = id => db.prepare('SELECT * FROM shops WHERE owner_id=?').get(id);

function publicShop(s) {
  return {
    name: s.name, slug: s.slug, description: s.description, address: s.address,
    contact_phone: s.contact_phone, zalo: s.zalo, open_hours: s.open_hours, logo_url: s.logo_url,
  };
}

function loadUser(req, res, next) {
  req.user = null;
  const id = req.session.userId;
  if (id) {
    const u = getUser(id);
    if (u && u.status === 'active') req.user = u;
    else req.session.userId = null;
  }
  next();
}
app.use(loadUser);

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
  next();
};

function baseUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// ---------- Realtime ----------
const io = new Server(server, {
  maxHttpBufferSize: 1e4,
  allowRequest: (req, cb) => {
    const origin = req.headers.origin;
    if (!origin) return cb(null, true);
    try { cb(null, new URL(origin).host === req.headers.host); } catch { cb(null, false); }
  },
});
io.engine.use(sessionMw);
io.use((socket, next) => {
  const id = socket.request.session && socket.request.session.userId;
  const u = id ? getUser(id) : null;
  socket.user = u && u.status === 'active' ? u : null;
  next();
});
io.on('connection', socket => {
  const u = socket.user;
  if (u) {
    socket.join(`user:${u.id}`);
    if (u.role === 'admin') socket.join('admin');
    if (u.role === 'shop') {
      const s = getShopByOwner(u.id);
      if (s) socket.join(`shop:${s.id}`);
    }
  }
  // Khách (kể cả ẩn danh) xem menu cửa hàng công khai
  socket.on('menu:watch', slug => {
    if (typeof slug === 'string' && slug.length < 80) socket.join(`menu:${slug}`);
  });
});

// ---------- Auth ----------
const registerSchema = z.object({
  role: z.enum(['customer', 'shop']),
  phone: phoneSchema,
  password: passSchema,
  name: str(80),
  shopName: str(100).optional(),
});

app.post('/api/auth/register', limiter(10, 15), wrap(async (req, res) => {
  const d = validate(registerSchema, req.body);
  if (d.role === 'shop' && !d.shopName) throw fail(400, 'Vui lòng nhập tên cửa hàng');
  if (db.prepare('SELECT 1 FROM users WHERE phone=?').get(d.phone)) throw fail(409, 'Số điện thoại đã được đăng ký');
  const hash = await bcrypt.hash(d.password, 10);
  const userId = db.transaction(() => {
    const r = db.prepare('INSERT INTO users (phone,password_hash,role,name) VALUES (?,?,?,?)')
      .run(d.phone, hash, d.role, d.name);
    if (d.role === 'shop') {
      db.prepare('INSERT INTO shops (owner_id,name,slug,contact_phone) VALUES (?,?,?,?)')
        .run(r.lastInsertRowid, d.shopName, slugify(d.shopName), d.phone);
    }
    return r.lastInsertRowid;
  })();
  if (d.role === 'shop') io.to('admin').emit('shop:registered', { name: d.shopName });
  await new Promise((ok, no) => req.session.regenerate(e => (e ? no(e) : ok())));
  req.session.userId = userId;
  res.status(201).json({ user: getUser(userId) });
}));

app.post('/api/auth/login', limiter(10, 15), wrap(async (req, res) => {
  const d = validate(z.object({ phone: phoneSchema, password: z.string().max(100) }), req.body);
  const row = db.prepare('SELECT * FROM users WHERE phone=?').get(d.phone);
  const ok = await bcrypt.compare(d.password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) throw fail(401, 'Sai số điện thoại hoặc mật khẩu');
  if (row.status !== 'active') throw fail(403, 'Tài khoản đã bị khoá');
  await new Promise((r, no) => req.session.regenerate(e => (e ? no(e) : r())));
  req.session.userId = row.id;
  res.json({ user: getUser(row.id) });
}));

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('sid'); res.json({ ok: true }); });
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

// ---------- Public shops ----------
app.get('/api/shops', (req, res) => {
  const rows = db.prepare("SELECT * FROM shops WHERE status='approved' ORDER BY name").all();
  res.json(rows.map(publicShop));
});

app.get('/api/shops/:slug', (req, res) => {
  const s = db.prepare("SELECT * FROM shops WHERE slug=? AND status='approved'").get(req.params.slug);
  if (!s) return res.status(404).json({ error: 'Không tìm thấy cửa hàng' });
  const products = db.prepare('SELECT id,name,price,unit,category,image,available FROM products WHERE shop_id=? ORDER BY category,name').all(s.id);
  res.json({ shop: publicShop(s), products });
});

function sendQr(req, res, shop) {
  const url = `${baseUrl(req)}/shop.html?s=${encodeURIComponent(shop.slug)}`;
  const opts = { width: 512, margin: 2, errorCorrectionLevel: 'M' };
  if (req.query.format === 'svg') {
    return QRCode.toString(url, { ...opts, type: 'svg' }).then(svg => {
      res.type('image/svg+xml').send(svg);
    });
  }
  return QRCode.toBuffer(url, opts).then(buf => {
    if (req.query.download) res.set('Content-Disposition', `attachment; filename="qr-${shop.slug}.png"`);
    res.type('image/png').send(buf);
  });
}

app.get('/api/shops/:slug/qr', wrap(async (req, res) => {
  const s = db.prepare("SELECT slug FROM shops WHERE slug=? AND status='approved'").get(req.params.slug);
  if (!s) return res.status(404).json({ error: 'Không tìm thấy cửa hàng' });
  await sendQr(req, res, s);
}));

// ---------- Orders (customer) ----------
const TRANSITIONS = {
  new: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'],
  delivering: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

function orderDto(o) {
  const items = db.prepare('SELECT product_id,name,price,qty FROM order_items WHERE order_id=?').all(o.id);
  const shop = db.prepare('SELECT name,slug FROM shops WHERE id=?').get(o.shop_id);
  return {
    code: o.public_code, status: o.status, total: o.total, created_at: o.created_at,
    customer_name: o.customer_name, phone: o.phone, address: o.address, note: o.note,
    payment_method: o.payment_method, shop: shop && { name: shop.name, slug: shop.slug }, items,
  };
}

const orderSchema = z.object({
  shopSlug: str(80),
  customer_name: str(80),
  phone: phoneSchema,
  address: str(250),
  note: z.string().trim().max(300).default(''),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    qty: z.number().min(0.5).max(99).refine(v => Number.isInteger(v * 2), 'Số lượng phải là bội của 0.5'),
  })).min(1).max(30),
});

app.post('/api/orders', requireRole('customer'), limiter(20, 10), wrap(async (req, res) => {
  const d = validate(orderSchema, req.body);
  const shop = db.prepare("SELECT * FROM shops WHERE slug=? AND status='approved'").get(d.shopSlug);
  if (!shop) throw fail(404, 'Cửa hàng không tồn tại hoặc tạm ngưng');

  const merged = new Map();
  for (const it of d.items) merged.set(it.productId, (merged.get(it.productId) || 0) + it.qty);

  const code = crypto.randomUUID();
  const orderId = db.transaction(() => {
    let total = 0;
    const lines = [];
    for (const [pid, qty] of merged) {
      const p = db.prepare('SELECT * FROM products WHERE id=? AND shop_id=?').get(pid, shop.id);
      if (!p || !p.available) throw fail(400, `Sản phẩm không còn bán (#${pid})`);
      if (qty > 99) throw fail(400, 'Số lượng quá lớn');
      total += Math.round(p.price * qty);
      lines.push([p, qty]);
    }
    const r = db.prepare(`INSERT INTO orders (public_code,shop_id,customer_id,customer_name,phone,address,note,total)
      VALUES (?,?,?,?,?,?,?,?)`).run(code, shop.id, req.user.id, d.customer_name, d.phone, d.address, d.note, total);
    const ins = db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty) VALUES (?,?,?,?,?)');
    for (const [p, qty] of lines) ins.run(r.lastInsertRowid, p.id, p.name, p.price, qty);
    return r.lastInsertRowid;
  })();

  const dto = orderDto(db.prepare('SELECT * FROM orders WHERE id=?').get(orderId));
  io.to(`shop:${shop.id}`).emit('order:new', dto);
  res.status(201).json(dto);
}));

app.get('/api/orders/mine', requireRole('customer'), (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json(rows.map(orderDto));
});

app.get('/api/orders/:code', requireRole('customer'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE public_code=? AND customer_id=?').get(req.params.code, req.user.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json(orderDto(o));
});

function changeStatus(order, next) {
  if (!TRANSITIONS[order.status].includes(next)) throw fail(409, 'Không thể chuyển trạng thái này');
  const r = db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?').run(next, order.id, order.status);
  if (!r.changes) throw fail(409, 'Đơn đã được cập nhật, vui lòng tải lại');
  const dto = orderDto(db.prepare('SELECT * FROM orders WHERE id=?').get(order.id));
  io.to(`user:${order.customer_id}`).emit('order:status', { code: dto.code, status: dto.status });
  io.to(`shop:${order.shop_id}`).emit('order:status', { code: dto.code, status: dto.status });
  return dto;
}

app.post('/api/orders/:code/cancel', requireRole('customer'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE public_code=? AND customer_id=?').get(req.params.code, req.user.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  if (o.status !== 'new') throw fail(409, 'Chỉ huỷ được đơn khi cửa hàng chưa xác nhận');
  res.json(changeStatus(o, 'cancelled'));
});

// ---------- Shop ----------
const shopOnly = [requireRole('shop'), (req, res, next) => {
  req.shop = getShopByOwner(req.user.id);
  if (!req.shop) return res.status(404).json({ error: 'Không tìm thấy cửa hàng' });
  next();
}];

app.get('/api/shop/profile', shopOnly, (req, res) => res.json({ ...publicShop(req.shop), status: req.shop.status }));

app.put('/api/shop/profile', shopOnly, (req, res) => {
  const d = validate(z.object({
    name: str(100), description: z.string().trim().max(500), address: z.string().trim().max(250),
    contact_phone: z.string().trim().max(20).regex(/^(\d{9,11})?$/, 'SĐT liên hệ không hợp lệ'),
    zalo: z.string().trim().max(20).regex(/^(\d{9,11})?$/, 'Số Zalo không hợp lệ'),
    open_hours: z.string().trim().max(60), logo_url: httpsUrl,
  }), req.body);
  db.prepare(`UPDATE shops SET name=?,description=?,address=?,contact_phone=?,zalo=?,open_hours=?,logo_url=? WHERE id=?`)
    .run(d.name, d.description, d.address, d.contact_phone, d.zalo, d.open_hours, d.logo_url, req.shop.id);
  res.json({ ok: true });
});

app.get('/api/shop/qr', shopOnly, wrap(async (req, res) => { await sendQr(req, res, req.shop); }));

const productSchema = z.object({
  name: str(100), price: z.number().int().min(0).max(1e9), unit: str(20),
  category: str(40), image: httpsUrl.default(''), available: z.boolean(),
});

app.get('/api/shop/products', shopOnly, (req, res) => {
  res.json(db.prepare('SELECT * FROM products WHERE shop_id=? ORDER BY category,name').all(req.shop.id));
});

const notifyMenu = shop => io.to(`menu:${shop.slug}`).emit('product:updated');

app.post('/api/shop/products', shopOnly, (req, res) => {
  const d = validate(productSchema, req.body);
  const r = db.prepare('INSERT INTO products (shop_id,name,price,unit,category,image,available) VALUES (?,?,?,?,?,?,?)')
    .run(req.shop.id, d.name, d.price, d.unit, d.category, d.image, d.available ? 1 : 0);
  notifyMenu(req.shop);
  res.status(201).json({ id: r.lastInsertRowid });
});

app.put('/api/shop/products/:id', shopOnly, (req, res) => {
  const d = validate(productSchema, req.body);
  const r = db.prepare('UPDATE products SET name=?,price=?,unit=?,category=?,image=?,available=? WHERE id=? AND shop_id=?')
    .run(d.name, d.price, d.unit, d.category, d.image, d.available ? 1 : 0, Number(req.params.id), req.shop.id);
  if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  notifyMenu(req.shop);
  res.json({ ok: true });
});

app.delete('/api/shop/products/:id', shopOnly, (req, res) => {
  const r = db.prepare('DELETE FROM products WHERE id=? AND shop_id=?').run(Number(req.params.id), req.shop.id);
  if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  notifyMenu(req.shop);
  res.json({ ok: true });
});

app.get('/api/shop/orders', shopOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE shop_id=? ORDER BY id DESC LIMIT 200').all(req.shop.id);
  res.json(rows.map(orderDto));
});

app.patch('/api/shop/orders/:code/status', shopOnly, (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['preparing', 'delivering', 'done', 'cancelled']) }), req.body);
  const o = db.prepare('SELECT * FROM orders WHERE public_code=? AND shop_id=?').get(req.params.code, req.shop.id);
  if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  res.json(changeStatus(o, status));
});

// ---------- Admin ----------
app.get('/api/admin/stats', requireRole('admin'), (req, res) => {
  res.json({
    users: db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c,
    shops: db.prepare('SELECT COUNT(*) c FROM shops').get().c,
    orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
    revenue: db.prepare("SELECT COALESCE(SUM(total),0) c FROM orders WHERE status='done'").get().c,
  });
});

app.get('/api/admin/shops', requireRole('admin'), (req, res) => {
  res.json(db.prepare(`SELECT s.id,s.name,s.slug,s.status,s.address,u.phone owner_phone,u.name owner_name,u.status owner_status
    FROM shops s JOIN users u ON u.id=s.owner_id ORDER BY s.id DESC`).all());
});

app.patch('/api/admin/shops/:id', requireRole('admin'), (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['pending', 'approved', 'suspended']) }), req.body);
  const r = db.prepare('UPDATE shops SET status=? WHERE id=?').run(status, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy cửa hàng' });
  res.json({ ok: true });
});

app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  res.json(db.prepare("SELECT id,phone,name,role,status,created_at FROM users WHERE role!='admin' ORDER BY id DESC LIMIT 500").all());
});

app.patch('/api/admin/users/:id', requireRole('admin'), wrap(async (req, res) => {
  const { status } = validate(z.object({ status: z.enum(['active', 'locked']) }), req.body);
  const id = Number(req.params.id);
  const r = db.prepare("UPDATE users SET status=? WHERE id=? AND role!='admin'").run(status, id);
  if (!r.changes) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
  if (status === 'locked') io.in(`user:${id}`).disconnectSockets(true);
  res.json({ ok: true });
}));

// ---------- Static & errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy' }));
app.use('/vendor/bootstrap', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/icons', express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap-icons', 'font')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ' : err.message });
});

server.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
