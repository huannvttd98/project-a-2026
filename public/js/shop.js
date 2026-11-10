(async () => {
  const user = await initNav();
  const slug = new URLSearchParams(location.search).get('s');
  const CART_KEY = 'cart:' + slug;
  let shop, products = [];
  let cart = {};
  let activeCat = null;
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch { cart = {}; }
  const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(cart));

  async function load() {
    try {
      ({ shop, products } = await api('GET', '/api/shops/' + encodeURIComponent(slug)));
    } catch (e) {
      $('main').replaceChildren(h('div', { class: 'alert alert-warning' }, e.message));
      return false;
    }
    document.title = shop.name;
    return true;
  }

  function renderInfo() {
    const phone = shop.contact_phone;
    $('#info').replaceChildren(h('div', { class: 'hero p-3' },
      h('div', { class: 'd-flex gap-3 align-items-start' },
        shop.logo_url ? h('img', { class: 'hero-logo', src: shop.logo_url, alt: '' }) : h('div', { class: 'hero-logo d-flex align-items-center justify-content-center bg-white fs-3' }, '🌿'),
        h('div', { class: 'flex-grow-1' },
          h('h1', { class: 'h4 mb-1' }, shop.name),
          h('div', {}, shop.description),
          h('div', { class: 'small text-muted' }, icon('geo-alt'), ' ', shop.address || '—'),
          h('div', { class: 'small text-muted' }, icon('clock'), ' ', shop.open_hours || '—'))),
      h('div', { class: 'd-flex flex-wrap gap-2 mt-3' },
        phone && h('a', { class: 'btn btn-success', href: 'tel:' + phone }, icon('telephone'), ' Gọi ', phone),
        shop.zalo && h('a', { class: 'btn btn-outline-success', href: 'https://zalo.me/' + shop.zalo, target: '_blank', rel: 'noopener noreferrer' }, icon('chat-dots'), ' Zalo'),
        h('button', { class: 'btn btn-outline-secondary', 'data-bs-toggle': 'modal', 'data-bs-target': '#qrModal' }, icon('qr-code'), ' Mã QR'))),
      h('div', { class: 'modal fade', id: 'qrModal', tabindex: '-1' },
        h('div', { class: 'modal-dialog modal-dialog-centered modal-sm' }, h('div', { class: 'modal-content text-center' },
          h('div', { class: 'modal-body' },
            h('h5', {}, shop.name),
            h('img', { class: 'qr', src: `/api/shops/${encodeURIComponent(slug)}/qr`, alt: 'Mã QR cửa hàng' }),
            h('p', { class: 'small text-muted mt-2 mb-0' }, 'Quét để mở trang cửa hàng'))))));
  }

  function renderMenu() {
    const cats = [...new Set(products.map(p => p.category))];
    if (activeCat && !cats.includes(activeCat)) activeCat = null;
    $('#chips').replaceChildren(...['Tất cả', ...cats].map(c => {
      const on = (c === 'Tất cả' && !activeCat) || c === activeCat;
      return h('button', { class: 'btn btn-sm ' + (on ? 'btn-success' : 'btn-outline-success'), onclick: () => { activeCat = c === 'Tất cả' ? null : c; renderMenu(); } }, c);
    }));
    const menu = $('#menu');
    menu.replaceChildren();
    const shown = products.filter(p => !activeCat || p.category === activeCat);
    if (!shown.length) menu.append(h('p', { class: 'text-muted mt-3' }, 'Cửa hàng chưa có sản phẩm.'));
    menu.append(h('div', { class: 'row g-2 g-md-3 mt-1' }, shown.map(p =>
      h('div', { class: 'col-6 col-md-4' },
        h('div', { class: 'card h-100' },
          p.image ? h('img', { class: 'thumb w-100', src: p.image, alt: '', loading: 'lazy' }) : h('div', { class: 'thumb-ph' }, '🥕'),
          h('div', { class: 'card-body d-flex flex-column p-2 p-md-3' },
            h('div', { class: 'fw-semibold' }, p.name),
            h('div', { class: 'price mb-2' }, money(p.price), h('small', { class: 'text-muted fw-normal' }, ' / ' + p.unit)),
            h('div', { class: 'mt-auto' }, p.available
              ? h('button', { class: 'btn btn-success btn-sm w-100', onclick: () => add(p.id) }, icon('cart-plus'), ' Thêm')
              : h('span', { class: 'badge text-bg-secondary' }, 'Hết hàng'))))))));
  }

  function add(id) { cart[id] = Math.min(99, (cart[id] || 0) + 1); saveCart(); renderCart(); toast('Đã thêm vào giỏ'); }

  function renderCart() {
    const box = $('#cart');
    for (const id of Object.keys(cart)) {
      const p = products.find(x => x.id === Number(id));
      if (!p || !p.available) delete cart[id];
    }
    saveCart();
    const lines = Object.entries(cart).map(([id, qty]) => ({ p: products.find(x => x.id === Number(id)), qty }));
    const total = lines.reduce((s, l) => s + Math.round(l.p.price * l.qty), 0);

    const bar = $('#cartBar');
    bar.classList.toggle('d-none', !lines.length);
    bar.classList.toggle('d-flex', !!lines.length);
    bar.replaceChildren(h('span', {}, icon('cart3'), ` ${lines.length} sản phẩm`), h('strong', {}, money(total)));

    box.replaceChildren(h('h2', { class: 'h5' }, '🛒 Giỏ hàng'));
    if (!lines.length) { box.append(h('p', { class: 'text-muted mb-0' }, 'Giỏ hàng trống')); return; }
    for (const { p, qty } of lines) {
      const setQty = v => { v = Math.round(v * 2) / 2; if (v > 0 && v <= 99) cart[p.id] = v; else delete cart[p.id]; saveCart(); renderCart(); };
      box.append(h('div', { class: 'd-flex justify-content-between align-items-center py-2 border-bottom' },
        h('div', {}, h('div', { class: 'fw-semibold' }, p.name), h('small', { class: 'text-muted' }, `${money(p.price)} / ${p.unit}`)),
        h('div', { class: 'input-group input-group-sm', style: 'width:130px' },
          h('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: () => setQty(qty - 0.5) }, '−'),
          h('input', { class: 'form-control text-center px-0', type: 'number', min: 0, max: 99, step: 0.5, value: qty, onchange: e => setQty(Number(e.target.value)) }),
          h('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: () => setQty(qty + 0.5) }, '+'))));
    }
    box.append(h('div', { class: 'd-flex justify-content-between my-3 fs-5' }, h('span', {}, 'Tổng'), h('span', { class: 'price' }, money(total))));

    if (!user) { box.append(h('a', { class: 'btn btn-success w-100', href: '/auth.html?next=' + encodeURIComponent(location.pathname + location.search) }, 'Đăng nhập để đặt hàng')); return; }
    if (user.role !== 'customer') { box.append(h('p', { class: 'text-muted mb-0' }, 'Chỉ tài khoản khách hàng mới đặt được hàng.')); return; }

    const err = h('div', { class: 'text-danger small my-2' });
    const input = (name, label, attrs) => h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small' }, label), h('input', { class: 'form-control', name, required: true, ...attrs }));
    const f = h('form', {},
      input('customer_name', 'Họ tên', { maxlength: 80, value: user.name }),
      input('phone', 'Số điện thoại', { type: 'tel', pattern: '0[0-9]{9,10}', value: user.phone }),
      input('address', 'Địa chỉ giao hàng', { maxlength: 250 }),
      h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small' }, 'Ghi chú'), h('textarea', { class: 'form-control', name: 'note', maxlength: 300, rows: 2 })),
      h('p', { class: 'small text-muted' }, icon('cash-coin'), ' Thanh toán khi nhận hàng (COD). Thanh toán online sẽ có sau.'),
      err, h('button', { class: 'btn btn-success w-100', type: 'submit' }, 'Đặt hàng'));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(f));
      try {
        await api('POST', '/api/orders', {
          shopSlug: slug, ...fd,
          items: Object.entries(cart).map(([id, qty]) => ({ productId: Number(id), qty })),
        });
        cart = {}; saveCart();
        location.href = '/orders.html';
      } catch (ex) { err.textContent = ex.message; }
    });
    box.append(f);
  }

  if (!(await load())) return;
  renderInfo(); renderMenu(); renderCart();

  const socket = connectSocket();
  socket.on('connect', () => socket.emit('menu:watch', slug));
  socket.on('product:updated', async () => { if (await load()) { renderMenu(); renderCart(); } });
})();
