(async () => {
  if (!(await initNav(['admin']))) return;

  const sel = (opts, cur, onchange) => h('select', { class: 'form-select form-select-sm', style: 'width:auto', onchange: e => onchange(e.target.value) },
    opts.map(o => h('option', { value: o, selected: o === cur }, STATUS[o])));

  async function load() {
    const [st, shops, users] = await Promise.all([
      api('GET', '/api/admin/stats'), api('GET', '/api/admin/shops'), api('GET', '/api/admin/users'),
    ]);
    $('#stats').replaceChildren(...[
      ['Khách hàng', st.users, 'people'], ['Cửa hàng', st.shops, 'shop'], ['Đơn hàng', st.orders, 'receipt'], ['Doanh thu', money(st.revenue), 'cash-stack'],
    ].map(([k, v, ic]) => h('div', { class: 'col-6 col-md-3' }, h('div', { class: 'card card-body' },
      h('div', { class: 'small text-muted' }, icon(ic), ' ', k), h('div', { class: 'fs-4 fw-bold' }, v)))));

    const act = fn => async v => { try { await fn(v); } catch (e) { toast(e.message); } load(); };
    $('#shops').replaceChildren(...shops.map(s => h('div', { class: 'card mb-2' }, h('div', { class: 'card-body py-2 d-flex flex-wrap justify-content-between align-items-center gap-2' },
      h('div', {}, h('a', { class: 'fw-semibold', href: '/shop.html?s=' + encodeURIComponent(s.slug) }, s.name),
        h('div', { class: 'small text-muted' }, `${s.owner_name} · ${s.owner_phone}`), badge(s.owner_status)),
      sel(['pending', 'approved', 'suspended'], s.status, act(v => api('PATCH', '/api/admin/shops/' + s.id, { status: v })))))));

    $('#users').replaceChildren(...users.map(u => h('div', { class: 'card mb-2' }, h('div', { class: 'card-body py-2 d-flex flex-wrap justify-content-between align-items-center gap-2' },
      h('div', {}, h('div', { class: 'fw-semibold' }, u.name),
        h('div', { class: 'small text-muted' }, `${u.phone} · ${u.role === 'shop' ? 'Cửa hàng' : 'Khách'} · ${fmtTime(u.created_at)}`)),
      sel(['active', 'locked'], u.status, act(v => api('PATCH', '/api/admin/users/' + u.id, { status: v })))))));
  }

  await load();
  const socket = connectSocket();
  socket.on('shop:registered', d => { toast('Cửa hàng mới đăng ký: ' + d.name); load(); });
})();
