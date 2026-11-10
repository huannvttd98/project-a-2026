const STATUS = {
  new: 'Mới', preparing: 'Đang chuẩn bị', delivering: 'Đang giao', done: 'Hoàn thành', cancelled: 'Đã huỷ',
  pending: 'Chờ duyệt', approved: 'Đã duyệt', suspended: 'Tạm ngưng', active: 'Hoạt động', locked: 'Bị khoá',
};
const STATUS_COLOR = {
  new: 'warning', preparing: 'primary', delivering: 'info', done: 'success', cancelled: 'danger',
  pending: 'warning', approved: 'success', suspended: 'danger', active: 'success', locked: 'danger',
};

// Dựng DOM an toàn (không dùng innerHTML với dữ liệu người dùng)
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const icon = n => h('i', { class: 'bi bi-' + n });
const money = n => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const fmtTime = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('vi-VN');
const badge = s => h('span', { class: `badge rounded-pill text-bg-${STATUS_COLOR[s] || 'secondary'}` }, STATUS[s] || s);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
  return data;
}

function toast(msg) {
  const t = h('div', { class: 'app-toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 200);
  } catch { /* trình duyệt chặn âm thanh */ }
  if (navigator.vibrate) navigator.vibrate(200);
}

let currentUser = null;

// Vẽ thanh điều hướng; trả về user hiện tại (hoặc null). `roles` giới hạn vai trò được vào trang.
async function initNav(roles) {
  const { user } = await api('GET', '/api/auth/me');
  currentUser = user;
  const link = (href, ic, text, extra = {}) =>
    h('li', { class: 'nav-item' }, h('a', { class: 'nav-link', href, ...extra }, icon(ic), ' ', text));
  const items = [link('/', 'shop', 'Cửa hàng')];
  if (!user) {
    items.push(link('/auth.html', 'box-arrow-in-right', 'Đăng nhập / Đăng ký'));
  } else {
    if (user.role === 'customer') items.push(link('/orders.html', 'receipt', 'Đơn của tôi'));
    if (user.role === 'shop') items.push(link('/dashboard.html', 'speedometer2', 'Quản lý cửa hàng'));
    if (user.role === 'admin') items.push(link('/admin.html', 'shield-lock', 'Quản trị'));
    items.push(h('li', { class: 'nav-item' }, h('span', { class: 'nav-link disabled text-white-50' }, icon('person-circle'), ' ', user.name)));
    items.push(link('#', 'box-arrow-right', 'Đăng xuất', {
      onclick: async e => { e.preventDefault(); await api('POST', '/api/auth/logout'); location.href = '/'; },
    }));
  }
  const header = h('nav', { class: 'navbar navbar-expand-lg navbar-dark bg-success sticky-top' },
    h('div', { class: 'container' },
      h('a', { class: 'navbar-brand fw-bold', href: '/' }, '🌾 Nông Sản Online'),
      h('button', {
        class: 'navbar-toggler', type: 'button', 'data-bs-toggle': 'collapse', 'data-bs-target': '#navMenu', 'aria-label': 'Menu',
      }, h('span', { class: 'navbar-toggler-icon' })),
      h('div', { class: 'collapse navbar-collapse', id: 'navMenu' }, h('ul', { class: 'navbar-nav ms-auto' }, items))));
  document.body.prepend(header);
  if (roles && (!user || !roles.includes(user.role))) {
    location.href = '/auth.html?next=' + encodeURIComponent(location.pathname + location.search);
    return null;
  }
  return user;
}

function connectSocket() {
  return window.io ? io() : { on() {}, emit() {} };
}
