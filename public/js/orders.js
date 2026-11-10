(async () => {
  if (!(await initNav(['customer']))) return;
  let orders = [];
  const STEPS = ['new', 'preparing', 'delivering', 'done'];

  async function load() { orders = await api('GET', '/api/orders/mine'); render(); }

  function progress(status) {
    if (status === 'cancelled') return null;
    const i = STEPS.indexOf(status);
    return h('div', { class: 'progress my-2', style: 'height:6px' },
      h('div', { class: 'progress-bar bg-success', style: `width:${((i + 1) / STEPS.length) * 100}%` }));
  }

  function render() {
    const list = $('#list');
    list.replaceChildren();
    if (!orders.length) list.append(h('div', { class: 'text-center text-muted py-5' }, h('div', { class: 'display-4' }, '🧺'), 'Bạn chưa có đơn hàng nào.', h('div', {}, h('a', { class: 'btn btn-success mt-3', href: '/' }, 'Đi mua sắm'))));
    for (const o of orders) {
      list.append(h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
        h('div', { class: 'd-flex justify-content-between align-items-start' },
          h('div', {}, h('div', { class: 'fw-bold' }, o.shop ? o.shop.name : ''),
            h('small', { class: 'text-muted' }, fmtTime(o.created_at) + ' · #' + o.code.slice(0, 8))),
          badge(o.status)),
        h('div', { class: 'small my-1' }, icon('clock'), ' ', deliverText(o)),
        progress(o.status),
        h('ul', { class: 'list-unstyled small mb-2' }, o.items.map(i => h('li', { class: 'd-flex justify-content-between' },
          h('span', {}, `${i.name} × ${i.qty}`), h('span', {}, i.price === null ? 'Chờ xác nhận giá' : money(Math.round(i.price * i.qty)))))),
        h('div', { class: 'd-flex justify-content-between align-items-center' },
          h('div', {}, h('span', { class: 'price' }, orderTotal(o)), h('small', { class: 'text-muted' }, ' (COD)')),
          o.status === 'new' && h('button', {
            class: 'btn btn-outline-danger btn-sm',
            onclick: async () => {
              if (!confirm('Huỷ đơn này?')) return;
              try { await api('POST', `/api/orders/${o.code}/cancel`); } catch (e) { toast(e.message); }
              load();
            },
          }, 'Huỷ đơn')))));
    }
  }

  await load();
  const socket = connectSocket();
  socket.on('order:status', ({ code, status }) => {
    const o = orders.find(x => x.code === code);
    if (!o) return load();
    o.status = status;
    render();
    toast(`Đơn #${code.slice(0, 8)}: ${STATUS[status]}`);
  });
  socket.on('connect', load);
  socket.on('order:updated', load);
})();
