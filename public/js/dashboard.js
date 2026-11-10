(async () => {
  if (!(await initNav(['shop']))) return;
  let tab = 'orders';
  let orders = [];
  const view = $('#view');
  const NEXT = { new: ['preparing', 'cancelled'], preparing: ['delivering', 'cancelled'], delivering: ['done', 'cancelled'] };
  const ACTION = { preparing: 'Xác nhận & chuẩn bị', delivering: 'Giao hàng', done: 'Hoàn thành', cancelled: 'Huỷ' };

  document.querySelectorAll('.tabs-bottom button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.t;
    document.querySelectorAll('.tabs-bottom button').forEach(x => x.classList.toggle('active', x === b));
    show();
  }));

  const show = () => ({ orders: showOrders, products: showProducts, profile: showProfile })[tab]();
  const field = (name, label, attrs = {}) => h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small' }, label), h('input', { class: 'form-control', name, ...attrs }));

  // ----- Đơn hàng -----
  async function loadOrders() { orders = await api('GET', '/api/shop/orders'); if (tab === 'orders') showOrders(); }

  function showOrders() {
    view.replaceChildren(h('h1', { class: 'h4 mb-3' }, 'Đơn hàng ', h('small', { class: 'text-success fs-6' }, icon('broadcast'), ' realtime')));
    if (!orders.length) view.append(h('p', { class: 'text-muted' }, 'Chưa có đơn hàng.'));
    for (const o of orders) {
      view.append(h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
        h('div', { class: 'd-flex justify-content-between align-items-start' },
          h('div', {}, h('div', { class: 'fw-bold' }, o.customer_name),
            h('a', { class: 'small', href: 'tel:' + o.phone }, icon('telephone'), ' ', o.phone)),
          badge(o.status)),
        h('div', { class: 'small text-muted mb-1' }, `${fmtTime(o.created_at)} · #${o.code.slice(0, 8)}`),
        h('div', { class: 'mb-1' }, icon('geo-alt'), ' ', o.address),
        o.note && h('div', { class: 'mb-1 fst-italic' }, icon('chat-left-text'), ' ', o.note),
        h('ul', { class: 'list-unstyled small my-2' }, o.items.map(i => h('li', { class: 'd-flex justify-content-between' },
          h('span', {}, `${i.name} × ${i.qty}`), h('span', {}, money(Math.round(i.price * i.qty)))))),
        h('div', { class: 'fs-5 mb-2' }, 'Tổng: ', h('span', { class: 'price' }, money(o.total)), h('small', { class: 'text-muted fs-6' }, ' (COD)')),
        h('div', { class: 'd-flex flex-wrap gap-2' }, (NEXT[o.status] || []).map(s => h('button', {
          class: 'btn ' + (s === 'cancelled' ? 'btn-outline-danger' : 'btn-success'),
          onclick: async () => {
            try { await api('PATCH', `/api/shop/orders/${o.code}/status`, { status: s }); } catch (e) { toast(e.message); }
            loadOrders();
          },
        }, ACTION[s]))))));
    }
  }

  // ----- Sản phẩm -----
  async function showProducts() {
    const rows = await api('GET', '/api/shop/products');
    const err = h('div', { class: 'text-danger small my-2' });
    const f = h('form', { class: 'card card-body mb-3' },
      h('h2', { class: 'h6' }, 'Thêm sản phẩm'),
      h('div', { class: 'row g-2' },
        h('div', { class: 'col-12' }, field('name', 'Tên', { required: true, maxlength: 100 })),
        h('div', { class: 'col-6' }, field('price', 'Giá (đ)', { type: 'number', min: 0, required: true, inputmode: 'numeric' })),
        h('div', { class: 'col-6' }, field('unit', 'Đơn vị', { required: true, value: 'kg', maxlength: 20 })),
        h('div', { class: 'col-12' }, field('category', 'Danh mục', { required: true, value: 'Rau củ', maxlength: 40 })),
        h('div', { class: 'col-12' }, field('image', 'Ảnh (https://...)', { type: 'url', maxlength: 500 }))),
      err, h('button', { class: 'btn btn-success', type: 'submit' }, icon('plus-lg'), ' Thêm'));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      try {
        await api('POST', '/api/shop/products', { ...d, price: Number(d.price), available: true });
        showProducts();
      } catch (ex) { err.textContent = ex.message; }
    });

    const list = rows.map(p => {
      const save = async patch => {
        try {
          await api('PUT', '/api/shop/products/' + p.id, {
            name: p.name, price: p.price, unit: p.unit, category: p.category, image: p.image, available: !!p.available, ...patch,
          });
        } catch (ex) { toast(ex.message); }
        showProducts();
      };
      return h('div', { class: 'card mb-2' }, h('div', { class: 'card-body py-2' },
        h('div', { class: 'd-flex justify-content-between align-items-center' },
          h('div', {}, h('div', { class: 'fw-semibold' }, p.name), h('small', { class: 'text-muted' }, `${p.category} · ${p.unit}`)),
          h('div', { class: 'form-check form-switch m-0' },
            h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', checked: !!p.available, onchange: e => save({ available: e.target.checked }) }),
            h('label', { class: 'form-check-label small' }, 'Còn hàng'))),
        h('div', { class: 'd-flex gap-2 mt-2' },
          h('input', { class: 'form-control form-control-sm', type: 'number', min: 0, inputmode: 'numeric', value: p.price, onchange: e => save({ price: Number(e.target.value) }) }),
          h('button', {
            class: 'btn btn-outline-danger btn-sm', 'aria-label': 'Xoá', onclick: async () => {
              if (!confirm('Xoá sản phẩm này?')) return;
              await api('DELETE', '/api/shop/products/' + p.id).catch(e => toast(e.message));
              showProducts();
            },
          }, icon('trash')))));
    });
    view.replaceChildren(h('h1', { class: 'h4 mb-3' }, 'Sản phẩm'), f, ...list);
  }

  // ----- Hồ sơ & QR -----
  async function showProfile() {
    const s = await api('GET', '/api/shop/profile');
    const err = h('div', { class: 'text-danger small my-2' });
    const fld = (name, label, attrs = {}) => field(name, label, { value: s[name] || '', ...attrs });
    const f = h('form', { class: 'card card-body mb-3' },
      h('div', { class: 'd-flex justify-content-between align-items-center' }, h('h2', { class: 'h6 mb-0' }, 'Hồ sơ cửa hàng'), badge(s.status)),
      s.status !== 'approved' && h('div', { class: 'alert alert-warning mt-2 mb-0 py-2' }, 'Cửa hàng đang không hiển thị công khai.'),
      h('div', { class: 'mt-2' }, fld('name', 'Tên cửa hàng', { required: true, maxlength: 100 })),
      h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small' }, 'Mô tả'), h('textarea', { class: 'form-control', name: 'description', maxlength: 500, rows: 3 }, s.description)),
      fld('address', 'Địa chỉ', { maxlength: 250 }),
      fld('contact_phone', 'SĐT liên hệ (công khai)', { type: 'tel', pattern: '[0-9]{9,11}|' }),
      fld('zalo', 'Số Zalo (công khai)', { type: 'tel', pattern: '[0-9]{9,11}|' }),
      fld('open_hours', 'Giờ mở cửa', { maxlength: 60 }),
      fld('logo_url', 'Logo (https://...)', { type: 'url', maxlength: 500 }),
      err, h('button', { class: 'btn btn-success', type: 'submit' }, 'Lưu'));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('PUT', '/api/shop/profile', Object.fromEntries(new FormData(f))); toast('Đã lưu'); showProfile(); }
      catch (ex) { err.textContent = ex.message; }
    });

    const link = `${location.origin}/shop.html?s=${encodeURIComponent(s.slug)}`;
    const qr = h('div', { class: 'card card-body text-center' },
      h('h2', { class: 'h6' }, 'Mã QR liên hệ cửa hàng'),
      h('p', { class: 'small text-muted' }, 'Khách quét để xem thông tin liên hệ, menu và đặt hàng.'),
      h('div', { class: 'printonly' }, h('h1', {}, s.name), h('p', {}, 'Quét mã để đặt hàng')),
      h('div', {}, h('img', { class: 'qr', src: '/api/shop/qr?t=' + Date.now(), alt: 'QR' })),
      h('p', { class: 'small text-muted text-break mt-2' }, link),
      h('div', { class: 'd-flex flex-wrap gap-2 justify-content-center noprint' },
        h('a', { class: 'btn btn-success', href: '/api/shop/qr?download=1' }, icon('download'), ' Tải PNG'),
        h('a', { class: 'btn btn-outline-success', href: '/api/shop/qr?format=svg', target: '_blank' }, 'SVG'),
        h('button', { class: 'btn btn-outline-secondary', onclick: () => window.print() }, icon('printer'), ' In')));
    view.replaceChildren(h('h1', { class: 'h4 mb-3 noprint' }, 'Hồ sơ & QR'), f, qr);
  }

  // ----- Realtime -----
  const socket = connectSocket();
  socket.on('order:new', o => {
    beep(); toast(`Đơn mới từ ${o.customer_name} — ${money(o.total)}`);
    loadOrders();
  });
  socket.on('order:status', loadOrders);
  socket.on('connect', loadOrders);
  await loadOrders();
})();
