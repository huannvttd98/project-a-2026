(async () => {
  await initNav();
  const shops = await api('GET', '/api/shops');
  const list = $('#list');

  function render() {
    const q = $('#q').value.trim().toLowerCase();
    const rows = shops.filter(s => !q || (s.name + ' ' + s.description + ' ' + s.address).toLowerCase().includes(q));
    list.replaceChildren();
    if (!rows.length) list.append(h('p', { class: 'text-muted' }, 'Không có cửa hàng phù hợp.'));
    for (const s of rows) {
      list.append(h('div', { class: 'col-12 col-md-6 col-lg-4' },
        h('a', { class: 'card h-100 text-decoration-none text-body', href: '/shop.html?s=' + encodeURIComponent(s.slug) },
          h('div', { class: 'card-body' },
            h('div', { class: 'd-flex gap-3 align-items-center mb-2' },
              s.logo_url ? h('img', { class: 'hero-logo', src: s.logo_url, alt: '' }) : h('div', { class: 'hero-logo d-flex align-items-center justify-content-center bg-success-subtle fs-3' }, '🌿'),
              h('h2', { class: 'h5 mb-0' }, s.name)),
            h('p', { class: 'mb-2' }, s.description || 'Nông sản tươi sạch'),
            h('div', { class: 'small text-muted' }, icon('geo-alt'), ' ', s.address || 'Chưa cập nhật'),
            h('div', { class: 'small text-muted' }, icon('clock'), ' ', s.open_hours || '—')))));
    }
  }
  $('#q').addEventListener('input', render);
  render();
})();
