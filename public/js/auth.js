(async () => {
  await initNav();
  let mode = 'login';
  const fields = $('#fields');
  const labels = { login: 'Đăng nhập', customer: 'Đăng ký khách hàng', shop: 'Đăng ký cửa hàng' };

  function field(id, label, type, extra) {
    return h('div', { class: 'mb-2' }, h('label', { class: 'form-label mb-1', for: id }, label),
      h('input', { class: 'form-control', id, type, required: true, ...extra }));
  }

  function render() {
    fields.replaceChildren(
      mode === 'shop' && field('shopName', 'Tên cửa hàng', 'text', { maxlength: 100 }),
      mode !== 'login' && field('name', mode === 'shop' ? 'Tên chủ cửa hàng' : 'Họ tên', 'text', { maxlength: 80 }),
      field('phone', 'Số điện thoại', 'tel', { pattern: '0[0-9]{9,10}', placeholder: '0912345678', autocomplete: 'username' }),
      field('password', 'Mật khẩu', 'password', {
        minlength: mode === 'login' ? 1 : 8, autocomplete: mode === 'login' ? 'current-password' : 'new-password',
      }),
    );
    $('#submit').textContent = labels[mode];
    $('#title').textContent = labels[mode];
    $('#err').textContent = '';
    for (const [id, m] of [['tLogin', 'login'], ['tCustomer', 'customer'], ['tShop', 'shop']]) {
      $('#' + id).classList.toggle('active', m === mode);
      $('#' + id).classList.toggle('btn-success', m === mode);
      $('#' + id).classList.toggle('btn-outline-success', m !== mode);
    }
  }
  for (const [id, m] of [['tLogin', 'login'], ['tCustomer', 'customer'], ['tShop', 'shop']]) {
    $('#' + id).addEventListener('click', () => { mode = m; render(); });
  }

  $('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const v = id => ($('#' + id) ? $('#' + id).value : undefined);
    try {
      const body = { phone: v('phone'), password: v('password') };
      if (mode !== 'login') Object.assign(body, { role: mode, name: v('name'), shopName: v('shopName') });
      const { user } = await api('POST', mode === 'login' ? '/api/auth/login' : '/api/auth/register', body);
      const next = new URLSearchParams(location.search).get('next');
      const safe = next && /^\/(?!\/)/.test(next) ? next : null;
      location.href = safe || { admin: '/admin.html', shop: '/dashboard.html', customer: '/' }[user.role];
    } catch (err) {
      $('#err').textContent = err.message;
    }
  });
  render();
})();
