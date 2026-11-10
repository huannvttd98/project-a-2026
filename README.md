# Nông Sản Online

Web đặt hàng nông sản realtime (chưa có thanh toán online – mặc định COD).

## Chạy
```
npm install
copy .env.example .env   # chỉnh ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_URL
npm start                # http://localhost:3000
```
Lần chạy đầu tạo admin (`ADMIN_PHONE` / `ADMIN_PASSWORD`; nếu để trống mật khẩu sẽ được sinh và in ra console) và một cửa hàng demo (`SEED_DEMO=0` để tắt).

## Tài khoản test (chỉ khi `SEED_DEMO` khác 0, tạo ở lần chạy đầu trên DB trống)
- Admin: `0933333333` / `Test12345`
- Cửa hàng: `0911111111` / `Test12345`
- Khách: `0922222222` / `Test12345`

Không dùng tài khoản này khi triển khai thật (đặt `SEED_DEMO=0`).

## Vai trò
- **Admin**: `/admin.html` – duyệt/tạm ngưng cửa hàng, khoá tài khoản, thống kê.
- **Cửa hàng**: tự đăng ký (mặc định được duyệt) – `/dashboard.html`: đơn realtime, sản phẩm, hồ sơ, mã QR (tải/in).
- **Khách**: tự đăng ký – xem cửa hàng, đặt hàng, theo dõi trạng thái realtime tại `/orders.html`.

Đăng nhập bằng số điện thoại. Mã QR trỏ tới `/shop.html?s=<slug>` (thông tin liên hệ + menu).

## Giao diện
Bootstrap 5 + Bootstrap Icons (cài qua npm, phục vụ từ `/vendor/...`, không dùng CDN), thiết kế mobile-first: giỏ hàng dạng ngăn kéo, thanh tab dưới cùng cho cửa hàng.

## Bảo mật
bcrypt, session cookie HttpOnly/SameSite=Strict, header `X-Requested-With` chống CSRF, helmet + CSP, rate limit, zod validate, giá tính phía server, phân quyền theo sở hữu, Socket.IO xác thực qua session và kiểm tra Origin. Khi triển khai: dùng HTTPS, `NODE_ENV=production`, đặt `SESSION_SECRET` và `PUBLIC_URL`; session đang lưu trong bộ nhớ (nên đổi sang store bền vững).
