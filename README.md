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

## Dữ liệu mẫu
`npm run seed:demo` thêm 7 danh mục nông sản (~32 sản phẩm), 4 khách (`0944444441`–`0944444444`, mật khẩu `Test12345`) và 12 đơn hàng nhiều trạng thái cho cửa hàng demo `0911111111`. Chạy lại không tạo trùng.

## Vai trò
- **Admin**: `/admin.html` – duyệt/tạm ngưng cửa hàng, khoá tài khoản, thống kê.
- **Cửa hàng**: tự đăng ký (mặc định được duyệt) – `/dashboard.html`: đơn realtime, sản phẩm, hồ sơ, mã QR (tải/in).
- **Khách**: tự đăng ký – xem cửa hàng, đặt hàng, theo dõi trạng thái realtime tại `/orders.html`.

### Dashboard cửa hàng (4 tab)
- **Đơn hàng**: lọc theo trạng thái, hiển thị giờ giao, cập nhật realtime.
- **Thống kê**: theo 24h/7 ngày/30 ngày/tất cả – đơn mới, đang làm, đang giao, đã giao, đã huỷ, doanh thu, tỉ lệ huỷ, top sản phẩm.
- **Menu**: tìm sản phẩm theo tên, lọc theo danh mục; quản lý danh mục trong mục thu gọn (thêm/sửa/xoá/sắp xếp; không xoá được danh mục còn sản phẩm) và sản phẩm.
- Ảnh sản phẩm: tải JPEG, PNG hoặc WebP từ thiết bị (tối đa 20 MB và 40 megapixel), hoặc nhập URL HTTPS; ảnh tải lên được lưu trong SQLite và tự xoá khi xoá hoặc thay ảnh sản phẩm.
- **Cài đặt**: thông tin cửa hàng, bật/tắt nhận đơn, đơn tối thiểu, thời gian chuẩn bị, mã QR.

### Đặt hàng
Khách chọn giờ giao (sớm nhất hoặc khung 30 phút trong hôm nay/ngày mai, tối thiểu sau thời gian chuẩn bị), xoá từng món hoặc xoá toàn bộ giỏ. Server kiểm tra giờ giao, đơn tối thiểu và trạng thái nhận đơn.

Giá sản phẩm có thể để trống để hiển thị **Liên hệ**; nhập `0` vẫn là giá 0đ. Khách vẫn có thể đặt hàng, nhưng tổng chỉ là tạm tính cho tới khi cửa hàng trao đổi với khách và nhập giá từng món trong đơn mới. Cửa hàng phải xác nhận tất cả giá trước khi chuyển đơn sang trạng thái chuẩn bị; giá xác nhận cập nhật tổng đơn và gửi cập nhật realtime cho khách. Đơn tối thiểu được kiểm tra dựa trên các món đã có giá lúc đặt hàng.

Đăng nhập bằng số điện thoại; khoảng trắng trong số điện thoại được tự động loại bỏ, mật khẩu giữ nguyên. Mã QR trỏ tới `/shop.html?s=<slug>` (thông tin liên hệ + menu).

## Giao diện
Bootstrap 5 + Bootstrap Icons (cài qua npm, phục vụ từ `/vendor/...`, không dùng CDN), thiết kế mobile-first: giỏ hàng dạng ngăn kéo, thanh tab dưới cùng cho cửa hàng.

## Bảo mật
bcrypt, session cookie HttpOnly/SameSite=Strict, header `X-Requested-With` chống CSRF, helmet + CSP, rate limit, zod validate, giá tính phía server, phân quyền theo sở hữu, Socket.IO xác thực qua session và kiểm tra Origin. Khi triển khai: dùng HTTPS, `NODE_ENV=production`, đặt `SESSION_SECRET` và `PUBLIC_URL`; session đang lưu trong bộ nhớ (nên đổi sang store bền vững).
