(async () => {
  if (!(await initNav(['shop']))) return;
  let tab = 'orders';
  let orders = [];
  let orderFilter = 'all';
  let statsRange = '7d';
  const view = $('#view');
  const NEXT = { new: ['preparing', 'cancelled'], preparing: ['delivering', 'cancelled'], delivering: ['done', 'cancelled'] };
  const ACTION = { preparing: 'Xác nhận & chuẩn bị', delivering: 'Giao hàng', done: 'Hoàn thành', cancelled: 'Huỷ đơn' };

  document.querySelectorAll('.tabs-bottom button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.t;
    document.querySelectorAll('.tabs-bottom button').forEach(x => x.classList.toggle('active', x === b));
    show();
  }));

  const show = () => ({ orders: showOrders, stats: showStats, menu: showMenu, settings: showSettings })[tab]();
  const field = (name, label, attrs = {}) => h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small' }, label), h('input', { class: 'form-control', name, ...attrs }));
  const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };
  const chip = (label, on, onclick) => h('button', { class: 'btn btn-sm ' + (on ? 'btn-success' : 'btn-outline-success'), onclick }, label);

  // ================= Đơn hàng =================
  async function loadOrders() { orders = await api('GET', '/api/shop/orders'); if (tab === 'orders') showOrders(); }

  function showOrders() {
    const count = s => orders.filter(o => s === 'all' || o.status === s).length;
    const shown = orders.filter(o => orderFilter === 'all' || o.status === orderFilter);
    view.replaceChildren(
      h('h1', { class: 'h4 mb-3' }, 'Đơn hàng ', h('small', { class: 'text-success fs-6' }, icon('broadcast'), ' realtime')),
      h('div', { class: 'cat-chips', style: 'top:0;position:static' },
        ['all', 'new', 'preparing', 'delivering', 'done', 'cancelled'].map(s =>
          chip(`${s === 'all' ? 'Tất cả' : STATUS[s]} (${count(s)})`, orderFilter === s, () => { orderFilter = s; showOrders(); }))));
    if (!shown.length) view.append(h('p', { class: 'text-muted mt-3' }, 'Không có đơn hàng.'));
    for (const o of shown) {
      view.append(h('div', { class: 'card mb-3 mt-2' }, h('div', { class: 'card-body' },
        h('div', { class: 'd-flex justify-content-between align-items-start' },
          h('div', {}, h('div', { class: 'fw-bold' }, o.customer_name),
            h('a', { class: 'small', href: 'tel:' + o.phone }, icon('telephone'), ' ', o.phone)),
          badge(o.status)),
        h('div', { class: 'small text-muted mb-1' }, `${fmtTime(o.created_at)} · #${o.code.slice(0, 8)}`),
        h('div', { class: 'mb-1 fw-semibold ' + (o.deliver_at ? 'text-primary' : '') }, icon('clock'), ' ', deliverText(o)),
        h('div', { class: 'mb-1' }, icon('geo-alt'), ' ', o.address),
        o.note && h('div', { class: 'mb-1 fst-italic' }, icon('chat-left-text'), ' ', o.note),
        h('ul', { class: 'list-unstyled small my-2' }, o.items.map(i => h('li', { class: 'd-flex justify-content-between' },
          h('span', {}, `${i.name} × ${i.qty}`), h('span', {}, i.price === null ? 'Chờ xác nhận giá' : money(Math.round(i.price * i.qty)))))),
        h('div', { class: 'fs-5 mb-2' }, h('span', { class: 'price' }, orderTotal(o)), h('small', { class: 'text-muted fs-6' }, ' (COD)')),
        o.price_pending && o.status === 'new' && priceForm(o),
        h('div', { class: 'd-flex flex-wrap gap-2' }, (NEXT[o.status] || []).map(s => h('button', {
          class: 'btn ' + (s === 'cancelled' ? 'btn-outline-danger' : 'btn-success'), disabled: o.price_pending && s !== 'cancelled',
          onclick: async () => {
            if (s === 'cancelled' && !confirm('Huỷ đơn này?')) return;
            await guard(() => api('PATCH', `/api/shop/orders/${o.code}/status`, { status: s }))();
            loadOrders();
          },
        }, ACTION[s]))))));
    }
  }

  function priceForm(o) {
    const pending = o.items.filter(i => i.price === null);
    const fields = pending.map(i => {
      const input = h('input', { class: 'form-control', type: 'number', min: 0, max: 1000000000, step: 1, required: true, inputmode: 'numeric', id: `price-${i.id}`, 'aria-label': `Giá ${i.name}` });
      return { item: i, input };
    });
    const err = h('div', { class: 'text-danger small', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn btn-outline-success btn-sm' }, 'Xác nhận giá');
    const form = h('form', { class: 'alert alert-warning py-2' },
      h('div', { class: 'fw-semibold small mb-2' }, 'Nhập giá từng sản phẩm sau khi trao đổi với khách'),
      fields.map(({ item, input }) => h('div', { class: 'mb-2' },
        h('label', { class: 'small', for: `price-${item.id}` }, `${item.name} × ${item.qty} (đ/đơn vị)`),
        input)),
      err, submit);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      submit.disabled = true;
      try {
        await api('PUT', `/api/shop/orders/${o.code}/prices`, { items: fields.map(({ item, input }) => ({ id: item.id, price: Number(input.value) })) });
        await loadOrders();
      } catch (ex) {
        err.textContent = ex.message;
        submit.disabled = false;
      }
    });
    return form;
  }

  // ================= Thống kê =================
  async function showStats() {
    const RANGES = { '24h': '24 giờ', '7d': '7 ngày', '30d': '30 ngày', all: 'Tất cả' };
    const st = await api('GET', '/api/shop/stats?range=' + statsRange);
    const card = (label, value, ic, color = '') => h('div', { class: 'col-6 col-md-4' }, h('div', { class: 'card card-body h-100' },
      h('div', { class: 'small text-muted' }, icon(ic), ' ', label), h('div', { class: 'fs-4 fw-bold ' + color }, value)));
    const inProgress = st.counts.new + st.counts.preparing + st.counts.delivering;
    view.replaceChildren(
      h('h1', { class: 'h4 mb-3' }, 'Thống kê đơn hàng'),
      h('div', { class: 'cat-chips', style: 'top:0;position:static' }, Object.entries(RANGES).map(([k, v]) =>
        chip(v, statsRange === k, () => { statsRange = k; showStats(); }))),
      h('div', { class: 'row g-2 my-1' },
        card('Tổng đơn', st.total, 'receipt'),
        card('Đã giao (hoàn thành)', st.counts.done, 'check-circle', 'text-success'),
        card('Đã huỷ', st.counts.cancelled, 'x-circle', 'text-danger'),
        card('Đang xử lý', inProgress, 'hourglass-split', 'text-primary'),
        card('Doanh thu', money(st.revenue), 'cash-stack', 'price'),
        card('Giá trị TB / đơn', money(st.avg), 'calculator')),
      h('div', { class: 'card card-body mt-3' },
        h('h2', { class: 'h6' }, 'Tỉ lệ theo trạng thái'),
        ['new', 'preparing', 'delivering', 'done', 'cancelled'].map(s => {
          const pct = st.total ? Math.round((st.counts[s] / st.total) * 100) : 0;
          return h('div', { class: 'mb-2' },
            h('div', { class: 'd-flex justify-content-between small' }, h('span', {}, STATUS[s]), h('span', {}, `${st.counts[s]} (${pct}%)`)),
            h('div', { class: 'progress', style: 'height:8px' }, h('div', { class: `progress-bar bg-${STATUS_COLOR[s]}`, style: `width:${pct}%` })));
        }),
        h('div', { class: 'small text-muted' }, `Tỉ lệ huỷ: ${st.cancelRate}%`)),
      h('div', { class: 'card card-body mt-3' },
        h('h2', { class: 'h6' }, 'Sản phẩm bán chạy (đơn hoàn thành)'),
        st.top.length ? st.top.map((t, i) => h('div', { class: 'd-flex justify-content-between py-1 border-bottom' },
          h('span', {}, `${i + 1}. ${t.name}`), h('span', { class: 'text-muted small' }, `${t.qty} · ${money(t.revenue)}`)))
          : h('p', { class: 'text-muted mb-0' }, 'Chưa có dữ liệu.')));
  }

  // ================= Menu =================
  let categoriesOpen = false;
  let menuSearch = '';
  let menuCategory = '';
  async function showMenu() {
    const [cats, prods] = await Promise.all([api('GET', '/api/shop/categories'), api('GET', '/api/shop/products')]);
    const reload = () => showMenu();

    // --- Danh mục ---
    const newCat = h('input', { class: 'form-control', placeholder: 'Tên danh mục mới', maxlength: 40 });
    const move = (i, d) => guard(async () => {
      const ids = cats.map(c => c.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      await api('POST', '/api/shop/categories/reorder', { ids });
      reload();
    });
    const catBox = h('details', {
      class: 'card menu-categories mb-3', open: categoriesOpen,
      ontoggle: e => { categoriesOpen = e.target.open; },
    },
      h('summary', { class: 'menu-categories-summary' },
        h('span', { class: 'fw-semibold' }, icon('collection'), ' Quản lý danh mục'),
        h('span', { class: 'text-muted small' }, `${cats.length} danh mục`)),
      h('div', { class: 'menu-categories-body' },
      cats.map((c, i) => h('div', { class: 'menu-category-row' },
        h('div', { class: 'menu-category-name' }, h('span', { class: 'fw-semibold' }, c.name), h('small', { class: 'text-muted d-block' }, `${c.products} sản phẩm`)),
        h('div', { class: 'd-flex gap-1' },
        h('button', { class: 'btn btn-outline-secondary btn-sm', disabled: i === 0, 'aria-label': 'Lên', onclick: move(i, -1) }, icon('arrow-up')),
        h('button', { class: 'btn btn-outline-secondary btn-sm', disabled: i === cats.length - 1, 'aria-label': 'Xuống', onclick: move(i, 1) }, icon('arrow-down')),
        h('button', {
          class: 'btn btn-outline-secondary btn-sm', 'aria-label': 'Đổi tên', onclick: guard(async () => {
            const name = prompt('Tên danh mục', c.name);
            if (name && name.trim() && name.trim() !== c.name) { await api('PUT', '/api/shop/categories/' + c.id, { name: name.trim() }); reload(); }
          }),
        }, icon('pencil')),
        h('button', {
          class: 'btn btn-outline-danger btn-sm', 'aria-label': 'Xoá', onclick: guard(async () => {
            if (!confirm(`Xoá danh mục "${c.name}"?`)) return;
            await api('DELETE', '/api/shop/categories/' + c.id); reload();
          }),
        }, icon('trash'))))),
      h('div', { class: 'input-group mt-2' }, newCat,
        h('button', {
          class: 'btn btn-success', onclick: guard(async () => {
            if (!newCat.value.trim()) return;
            await api('POST', '/api/shop/categories', { name: newCat.value.trim() }); reload();
          }),
        }, icon('plus-lg'), ' Thêm'))));

    // --- Sản phẩm ---
    if (menuCategory && !cats.some(c => c.name === menuCategory)) menuCategory = '';
    const list = h('div');
    const search = h('input', { class: 'form-control', type: 'search', placeholder: 'Tìm tên sản phẩm', 'aria-label': 'Tìm sản phẩm', value: menuSearch });
    const category = h('select', { class: 'form-select', 'aria-label': 'Lọc danh mục' },
      h('option', { value: '' }, 'Tất cả danh mục'),
      cats.map(c => h('option', { value: c.name }, c.name)));
    category.value = menuCategory;
    function renderProducts() {
      const groups = [];
      const term = menuSearch.trim().toLocaleLowerCase('vi');
      for (const c of cats) {
        const items = prods.filter(p => p.category === c.name && (!menuCategory || p.category === menuCategory) && p.name.toLocaleLowerCase('vi').includes(term));
        if (!items.length) continue;
        groups.push(h('h3', { class: 'h6 mt-3 mb-2 text-success' }, c.name));
        for (const p of items) {
          const toggle = async e => {
            const input = e.target;
            input.disabled = true;
            try {
              await api('PUT', '/api/shop/products/' + p.id, { name: p.name, price: p.price, unit: p.unit, category: p.category, image: p.image, available: input.checked });
              await reload();
            } catch (err) {
              input.checked = !!p.available;
              input.disabled = false;
              toast(err.message);
            }
          };
          groups.push(h('div', { class: 'card menu-product mb-2' },
            h('div', { class: 'menu-product-main' },
              p.image ? h('img', { class: 'menu-product-image', src: p.image, alt: '', loading: 'lazy' })
                : h('div', { class: 'menu-product-image menu-product-placeholder', 'aria-hidden': 'true' }, icon('image')),
              h('div', { class: 'menu-product-info' },
                h('div', { class: 'fw-semibold' }, p.name),
                h('div', { class: 'price small' }, productPrice(p.price), h('span', { class: 'text-muted fw-normal' }, ` / ${p.unit}`))),
              h('span', { class: 'badge ' + (p.available ? 'text-bg-success' : 'text-bg-secondary') }, p.available ? 'Còn hàng' : 'Hết hàng')),
            h('div', { class: 'menu-product-actions' },
              h('div', { class: 'form-check form-switch m-0' },
                h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: `available-${p.id}`, checked: !!p.available, onchange: toggle }),
                h('label', { class: 'form-check-label small', for: `available-${p.id}` }, 'Còn hàng')),
              h('div', { class: 'd-flex gap-2' },
                h('button', { class: 'btn btn-outline-secondary btn-sm', 'aria-label': `Sửa ${p.name}`, onclick: () => openProduct(p, cats, reload) }, icon('pencil'), ' Sửa'),
                h('button', {
                  class: 'btn btn-outline-danger btn-sm', 'aria-label': `Xoá ${p.name}`, onclick: guard(async () => {
                    if (!confirm(`Xoá "${p.name}"?`)) return;
                    await api('DELETE', '/api/shop/products/' + p.id); await reload();
                  }),
                }, icon('trash'))))));
        }
      }
      list.replaceChildren(...(groups.length ? groups : [h('p', { class: 'text-muted mt-3' }, prods.length ? 'Không tìm thấy sản phẩm phù hợp.' : 'Chưa có sản phẩm. Hãy thêm sản phẩm đầu tiên.')]));
    }
    search.addEventListener('input', () => { menuSearch = search.value; renderProducts(); });
    category.addEventListener('change', () => { menuCategory = category.value; renderProducts(); });
    renderProducts();
    view.replaceChildren(
      h('div', { class: 'd-flex flex-wrap gap-2 justify-content-between align-items-center mb-3' },
        h('div', {}, h('h1', { class: 'h4 mb-0' }, 'Menu cửa hàng'), h('div', { class: 'small text-muted' }, `${prods.length} sản phẩm · ${cats.length} danh mục`)),
        h('button', { class: 'btn btn-success', disabled: !cats.length, onclick: () => openProduct(null, cats, reload) }, icon('plus-lg'), ' Thêm sản phẩm')),
      catBox,
      h('h2', { class: 'h6 mb-2' }, 'Sản phẩm'),
      h('div', { class: 'row g-2' },
        h('div', { class: 'col-12 col-sm-7' }, search),
        h('div', { class: 'col-12 col-sm-5' }, category)),
      list);
  }

  function openProduct(p, cats, done) {
    document.getElementById('productModal')?.remove();
    const err = h('div', { class: 'text-danger small mt-2' });
    const storedImage = p && p.image.startsWith('/api/product-images/') ? p.image : '';
    const imageFile = h('input', { class: 'form-control', type: 'file', name: 'imageFile', id: 'productImageFile', accept: 'image/jpeg,image/png,image/webp' });
    const removeImage = h('input', { class: 'form-check-input', type: 'checkbox', id: 'removeProductImage' });
    const f = h('form', {},
      h('div', { class: 'modal-header' }, h('h5', { class: 'modal-title' }, p ? 'Sửa sản phẩm' : 'Thêm sản phẩm'),
        h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Đóng' })),
      h('div', { class: 'modal-body product-form' },
        h('h6', { class: 'product-form-heading' }, 'Thông tin sản phẩm'),
        field('name', 'Tên sản phẩm', { required: true, maxlength: 100, placeholder: 'Ví dụ: Cà chua', value: p ? p.name : '' }),
        h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small', for: 'productCategory' }, 'Danh mục'),
          h('select', { class: 'form-select', name: 'category', id: 'productCategory', required: true }, cats.map(c => h('option', { value: c.name, selected: p ? p.category === c.name : false }, c.name)))),
        h('div', { class: 'row g-2' },
          h('div', { class: 'col-6' }, field('price', 'Giá (đ) · để trống nếu liên hệ', { type: 'number', min: 0, max: 1000000000, inputmode: 'numeric', value: p && p.price !== null ? p.price : '' })),
          h('div', { class: 'col-6' }, field('unit', 'Đơn vị', { required: true, maxlength: 20, value: p ? p.unit : 'kg', list: 'unitList' }))),
        h('datalist', { id: 'unitList' }, ['kg', 'g', 'bó', 'quả', 'nải', 'túi', 'hộp'].map(u => h('option', { value: u }))),
        h('div', { class: 'form-check form-switch product-stock' },
          h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', name: 'available', id: 'pAvail', checked: p ? !!p.available : true }),
          h('label', { class: 'form-check-label', for: 'pAvail' }, 'Sản phẩm còn hàng')),
        h('h6', { class: 'product-form-heading mt-3' }, 'Ảnh sản phẩm'),
        p && p.image && h('div', { class: 'd-flex align-items-center gap-3 mb-2' },
          h('img', { class: 'menu-product-image', src: p.image, alt: 'Ảnh sản phẩm hiện tại' }),
          h('div', { class: 'form-check' }, removeImage, h('label', { class: 'form-check-label small', for: 'removeProductImage' }, 'Xoá ảnh hiện tại'))),
        h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small', for: 'productImageFile' }, 'Tải ảnh từ thiết bị'),
          imageFile, h('div', { class: 'form-text' }, 'JPEG, PNG hoặc WebP, tối đa 20 MB và 40 megapixel. Ảnh mới sẽ thay ảnh hiện tại.')),
        h('details', { class: 'product-image-url', open: !!(p && p.image && !storedImage) },
          h('summary', { class: 'small' }, 'Hoặc dùng đường dẫn ảnh'),
          field('image', 'Đường dẫn ảnh (https://...)', { type: 'url', maxlength: 500, value: p && !storedImage ? p.image : '' })),
        err),
      h('div', { class: 'modal-footer' },
        h('button', { type: 'button', class: 'btn btn-outline-secondary', 'data-bs-dismiss': 'modal' }, 'Huỷ'),
        h('button', { type: 'submit', class: 'btn btn-success' }, 'Lưu')));
    const modalEl = h('div', { class: 'modal fade', id: 'productModal', tabindex: '-1' },
      h('div', { class: 'modal-dialog modal-dialog-centered modal-dialog-scrollable' }, h('div', { class: 'modal-content' }, f)));
    document.body.append(modalEl);
    const modal = new bootstrap.Modal(modalEl);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const d = new FormData(f);
      const body = {
        name: d.get('name'), price: d.get('price') === '' ? null : Number(d.get('price')), unit: d.get('unit'), category: d.get('category'),
        image: removeImage.checked ? '' : (d.get('image') || storedImage), available: f.elements.available.checked,
      };
      const file = imageFile.files[0];
      const submit = f.querySelector('[type=submit]');
      try {
        err.textContent = '';
        if (file && removeImage.checked) throw new Error('Hãy chọn tải ảnh mới hoặc xoá ảnh hiện tại, không chọn cả hai.');
        if (file && file.size > 20 * 1024 * 1024) throw new Error('Ảnh không được lớn hơn 20 MB.');
        if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
        submit.disabled = true;
        if (file) body.imageData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Không thể đọc ảnh đã chọn.'));
          reader.readAsDataURL(file);
        });
        await (p ? api('PUT', '/api/shop/products/' + p.id, body) : api('POST', '/api/shop/products', body));
        modal.hide(); done();
      } catch (ex) { err.textContent = ex.message; }
      finally { submit.disabled = false; }
    });
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    modal.show();
  }

  // ================= Cài đặt =================
  async function showSettings() {
    const s = await api('GET', '/api/shop/profile');
    const err = h('div', { class: 'text-danger small my-2' });
    const fld = (name, label, attrs = {}) => field(name, label, { value: s[name] ?? '', ...attrs });
    const f = h('form', { class: 'card card-body mb-3' },
      h('div', { class: 'd-flex justify-content-between align-items-center' }, h('h2', { class: 'h6 mb-0' }, 'Thông tin cửa hàng'), badge(s.status)),
      s.status !== 'approved' && h('div', { class: 'alert alert-warning mt-2 mb-0 py-2' }, 'Cửa hàng đang không hiển thị công khai (do quản trị viên).'),
      h('div', { class: 'mt-2' }, fld('name', 'Tên cửa hàng', { required: true, maxlength: 100 })),
      h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1 small' }, 'Mô tả'), h('textarea', { class: 'form-control', name: 'description', maxlength: 500, rows: 3 }, s.description)),
      fld('address', 'Địa chỉ', { maxlength: 250 }),
      fld('contact_phone', 'SĐT liên hệ (công khai)', { type: 'tel', pattern: '[0-9]{9,11}|' }),
      fld('zalo', 'Số Zalo (công khai)', { type: 'tel', pattern: '[0-9]{9,11}|' }),
      fld('open_hours', 'Giờ mở cửa (VD: 6:00 - 20:00)', { maxlength: 60 }),
      fld('logo_url', 'Logo (https://...)', { type: 'url', maxlength: 500 }),
      h('hr'),
      h('h2', { class: 'h6' }, 'Cài đặt nhận đơn'),
      h('div', { class: 'form-check form-switch mb-2' },
        h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: 'accepting', checked: !!s.accepting_orders }),
        h('label', { class: 'form-check-label', for: 'accepting' }, 'Đang nhận đơn (tắt = tạm đóng cửa)')),
      h('div', { class: 'row g-2' },
        h('div', { class: 'col-6' }, fld('min_order', 'Đơn tối thiểu (đ)', { type: 'number', min: 0, inputmode: 'numeric' })),
        h('div', { class: 'col-6' }, fld('prep_minutes', 'Thời gian chuẩn bị (phút)', { type: 'number', min: 0, max: 600, inputmode: 'numeric' }))),
      err, h('button', { class: 'btn btn-success', type: 'submit' }, 'Lưu cài đặt'));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      try {
        await api('PUT', '/api/shop/profile', {
          ...d, accepting_orders: f.querySelector('#accepting').checked,
          min_order: Number(d.min_order || 0), prep_minutes: Number(d.prep_minutes || 0),
        });
        toast('Đã lưu cài đặt'); showSettings();
      } catch (ex) { err.textContent = ex.message; }
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
    view.replaceChildren(h('h1', { class: 'h4 mb-3 noprint' }, 'Cài đặt cửa hàng'), f, qr);
  }

  // ================= Realtime =================
  const socket = connectSocket();
  socket.on('order:new', o => {
    beep(); toast(`Đơn mới từ ${o.customer_name} — ${orderTotal(o)}`);
    loadOrders();
  });
  socket.on('order:status', () => { loadOrders(); if (tab === 'stats') showStats(); });
  socket.on('order:updated', loadOrders);
  socket.on('connect', loadOrders);
  await loadOrders();
})();
