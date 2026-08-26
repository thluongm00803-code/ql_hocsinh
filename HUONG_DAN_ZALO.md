# Zalo + Import Excel — EduCenter Firebase

Bản này đã được ghép trực tiếp vào **source đầy đủ `educenter-firebase-main_3`**.

## Chức năng Zalo đã tích hợp

### 1. Trang Học sinh
- Gửi Zalo riêng cho từng phụ huynh.
- Checkbox chọn nhiều học sinh và gửi hàng loạt.
- Tin mẫu tự kèm link báo cáo `/parent/:studentId` và thanh toán `/pay/:studentId`.
- Có thể đính ảnh, PDF, Word, Excel; ảnh được nén trước khi gửi.
- Admin có thể mở nhanh khối kết nối Zalo.

### 2. Trang Điểm danh
- Sau khi chọn lớp/ngày, hệ thống xác định danh sách học sinh vắng.
- Nút **Gửi Zalo HS vắng** tạo tin riêng theo từng học sinh, kèm ghi chú điểm danh nếu có.
- Nhật ký gửi dùng khóa `ATTENDANCE + classId + date`.

### 3. Trang Điểm số
- Nút **Gửi Zalo bảng điểm** gửi toàn bộ các cột điểm đã lưu và điểm trung bình /10 cho từng phụ huynh.
- Nếu còn dòng điểm chưa lưu, hệ thống yêu cầu lưu trước khi gửi.
- Nhật ký gửi dùng `GRADES + classId + gradebookId`.

### 4. Trang Học phí
- Nút **Zalo chưa thu (n)** gửi nhắc hàng loạt những học sinh chưa thanh toán.
- Từng học sinh có nút **Zalo** riêng.
- Tin tự có số buổi, số tiền, nội dung chuyển khoản và link trang QR `/pay/:studentId`.
- Nhật ký gửi dùng `TUITION + classId + monthKey`.

### 5. Trang Zalo riêng cho Admin
Menu **Zalo** dùng để xem trạng thái backend, quota/hàng đợi và đăng nhập lại bằng QR.

## Cảnh báo gửi trùng

`api/zalo.js` ghi nhật ký vào Firestore bằng Firebase Admin:

```text
zaloSendLogs/{kind__classId__periodKey}/students/{studentId}
```

Khi mở hộp gửi cho một kỳ đã gửi trước đó, giao diện hiển thị số người đã nhận và yêu cầu xác nhận trước khi gửi lại.

## Kiến trúc bảo mật

Frontend không biết API key của Zalo backend.

```text
React/Firebase Auth
   -> Firebase ID token
   -> POST /api/zalo (Vercel Function)
   -> kiểm tra users/{uid}
   -> x-api-key
   -> zalo-service trên Render
```

`ZALO_BACKEND_API_KEY` chỉ đặt ở Vercel Environment Variables.

## Biến môi trường trên Vercel

```text
ZALO_BACKEND_URL=https://ten-zalo-service.onrender.com
ZALO_BACKEND_API_KEY=chuoi-api-key-giong-API_KEY-ben-Render
FIREBASE_SERVICE_ACCOUNT_JSON={...toan-bo-json-service-account...}
```

Cùng với các biến `VITE_FIREBASE_*` và `VITE_BANK_*` của web chính.

## Biến môi trường trên Zalo service Render

Backend Zalo cần tối thiểu:

```text
API_KEY=chuoi-giong-ZALO_BACKEND_API_KEY
ZALO_SESSION=...
```

Sau khi quét QR thành công, giao diện Admin trả về chuỗi phiên để sao chép vào `ZALO_SESSION` nếu backend của bạn cần giữ phiên qua lần restart.

## Endpoint Zalo backend được sử dụng

```text
GET  /health
GET  /job/:id
GET  /threads
GET  /messages/:id
GET  /updates
POST /send
POST /send-bulk
POST /send-file
POST /resolve
POST /read/:id
POST /threads/:id/name
POST /login/start
GET  /login/state
POST /login/retry
```

## Import danh sách học sinh từ Excel

Vào **Học sinh**:

1. Bấm **Tải file mẫu**.
2. Điền dữ liệu vào Excel.
3. Nếu muốn xếp lớp ngay, chọn `Import vào lớp ...`.
4. Bấm **Import Excel**.

Các cột được hỗ trợ:

```text
Họ tên học sinh *
Lớp hành chính
Tên phụ huynh
SĐT phụ huynh
Email phụ huynh
Ghi chú
Trạng thái
```

Parser cũng chấp nhận các tên tương đương như `Họ tên học sinh`, `Tên học sinh`, `Lớp`, `Phụ huynh`, `Số điện thoại phụ huynh`, `Điện thoại`, `Email`.

Nếu Excel làm mất số `0` đầu của số điện thoại (ví dụ `0901234567` thành `901234567`), importer sẽ tự phục hồi `0` cho số điện thoại Việt Nam có độ dài phù hợp.

Học sinh trùng trong file sẽ bị bỏ qua. Học sinh đã tồn tại trong Firestore sẽ không tạo bản sao; nếu đã chọn lớp import thì hệ thống vẫn tạo/cập nhật enrollment cho học sinh đó.

## Cài đặt

```bash
npm install
npm run build
```

Các dependency mới:

```text
xlsx
firebase-admin
```

`firebase-admin` chỉ được sử dụng trong `api/zalo.js`, không được đưa vào frontend bundle.
