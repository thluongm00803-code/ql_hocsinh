# Quản lý Trung tâm — Firebase + React + TypeScript

Ứng dụng quản lý trung tâm giáo dục: lớp học, học sinh, điểm danh, điểm số, học phí, và trang báo cáo cho phụ huynh. Dữ liệu lưu trên **Firebase Firestore**, đăng nhập bằng **Google**, có hệ thống **duyệt người dùng** (người đầu tiên tự động là Quản trị viên).

## Tính năng

- 🔐 Đăng nhập Google, duyệt tài khoản (người đầu tiên = Admin, người sau chờ duyệt)
- 👑 Ba vai trò: **Quản trị viên**, **Giáo viên**, **Trợ giảng** — menu và quyền khác nhau
- 🏫 Quản lý lớp học, phân công giáo viên/trợ giảng
- 👤 Quản lý học sinh (thêm/sửa/xóa), **import danh sách từ Excel**, sinh link riêng cho phụ huynh
- ✅ Điểm danh theo buổi
- 📝 Nhập điểm theo bài kiểm tra
- 💰 Tính học phí theo số buổi đã học
- 👨‍👩‍👧 Trang phụ huynh xem điểm & chuyên cần (không cần đăng nhập)
- 💬 **Zalo**: gửi riêng/hàng loạt, nhắc vắng học, gửi bảng điểm, nhắc học phí, kết nối QR cho Admin


## Import học sinh từ Excel

Vào **Học sinh** → **Tải file mẫu** → điền danh sách → chọn lớp nếu muốn xếp lớp ngay → **Import Excel**. Importer hỗ trợ tên cột tiếng Việt phổ biến, tránh tạo trùng và tự xử lý trường hợp Excel làm mất số `0` đầu của SĐT phụ huynh.

## Tích hợp Zalo

Source đã có `api/zalo.js` làm Vercel proxy và các nút gửi ở **Học sinh / Điểm danh / Điểm số / Học phí**. Admin có menu **Zalo** để kết nối bằng QR. Xem toàn bộ biến môi trường và sơ đồ triển khai tại `HUONG_DAN_ZALO.md`.

## Công nghệ

Vite • React 18 • TypeScript • React Router • Firebase (Auth + Firestore) • lucide-react

---

## 1. Tạo project Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Vào **Build → Authentication → Get started → Sign-in method** → bật **Google**.
3. Vào **Build → Firestore Database → Create database** (Production mode).
4. Vào **Project settings (⚙️) → General → Your apps → Web (</>)** để lấy config.

## 2. Cấu hình biến môi trường

Copy `.env.example` thành `.env` và điền config Firebase:

```bash
cp .env.example .env
```

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Chạy thử ở máy

```bash
npm install
npm run dev
```

Mở http://localhost:5173 → đăng nhập bằng Google. **Tài khoản đầu tiên** sẽ tự động trở thành Quản trị viên.

## 4. Nạp Firestore Rules & Indexes

Cách nhanh (dán tay): mở **Firestore → Rules**, dán nội dung `firestore.rules`, bấm **Publish**.

Cách dùng CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use your-project-id
firebase deploy --only firestore:rules,firestore:indexes
```

> Hai composite index (attendance theo `classId+date`, scores theo `classId+examName`) đã khai báo sẵn trong `firestore.indexes.json`. Nếu chưa deploy index, lần đầu chạy query Firestore sẽ báo lỗi kèm link tạo index — bấm vào là xong.

---

## 5. Deploy lên Vercel + GitHub

1. Đẩy code lên GitHub:

```bash
git init
git add .
git commit -m "Init edu center firebase"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

2. Vào [vercel.com](https://vercel.com) → **Add New → Project** → chọn repo.
3. Framework preset: **Vite** (tự nhận). Build command `npm run build`, output `dist`.
4. Thêm **Environment Variables** (6 biến `VITE_FIREBASE_*` như trên).
5. **Deploy**.
6. Sau khi có domain Vercel (vd `your-app.vercel.app`), quay lại Firebase → **Authentication → Settings → Authorized domains** → thêm domain đó.

File `vercel.json` đã cấu hình rewrite để React Router hoạt động khi refresh trang.

---

## Trang thanh toán học phí (QR VietQR)

Mỗi học sinh có một link thanh toán chạy trên domain Vercel:

```
https://<domain-vercel>/pay/<studentId>
```

Trang này hiển thị chi tiết học phí theo lớp, tổng tiền, **mã QR VietQR** (đã điền sẵn số tiền + nội dung) và thông tin chuyển khoản thủ công. Copy link ở trang **Học sinh → cột "Link chia sẻ" → nút "Học phí"** rồi gửi cho phụ huynh. Trang phụ huynh (`/parent/:id`) cũng có nút "Xem phiếu & đóng học phí".

Để QR hoạt động, thêm các biến sau vào Vercel (Environment Variables) rồi Redeploy:

| Biến | Ví dụ | Ghi chú |
|------|-------|---------|
| `VITE_BANK_ID` | `VCB` | Mã ngân hàng hoặc BIN (vd `970436`) |
| `VITE_BANK_ACCOUNT` | `0123456789` | Số tài khoản nhận tiền |
| `VITE_BANK_ACCOUNT_NAME` | `NGUYEN VAN A` | Tên chủ TK (HOA, không dấu) |
| `VITE_CENTER_NAME` | `Trung tâm ABC` | (tuỳ chọn) tên hiển thị |

> QR dùng dịch vụ ảnh miễn phí của VietQR (`img.vietqr.io`), không cần API key, sinh hoàn toàn phía trình duyệt.

## Gửi email cho phụ huynh (tuỳ chọn, cần thêm backend)

Không thể gửi email an toàn từ phía trình duyệt. Hai cách phổ biến:

**Cách A — Vercel Serverless Function + Resend (khuyên dùng):** thêm thư mục `api/` với một function gửi mail, đặt `RESEND_API_KEY` trong env Vercel. Không cần nâng cấp Firebase. Gửi khi bấm nút (vd "Nhắc học phí") hoặc theo lịch bằng Vercel Cron.

**Cách B — Firebase "Trigger Email" extension:** cài extension, app chỉ cần ghi 1 document vào collection `mail` là extension tự gửi. Cần bật gói **Blaze** (trả theo dùng).

Mình có thể dựng sẵn cách A (function + nút "Gửi email học phí" kèm link `/pay/:id`) nếu bạn cho biết muốn dùng Resend hay Gmail SMTP.

## Cấu trúc dữ liệu (Firestore)

| Collection      | Ý nghĩa                        | Trường chính |
|-----------------|--------------------------------|--------------|
| `users`         | Tài khoản (doc id = UID)       | name, email, role, isApproved |
| `classes`       | Lớp học                        | className, subject, grade, feePerSession, startDate, status |
| `students`      | Học sinh                       | fullName, studentClass, parentName, parentPhone, status |
| `enrollments`   | HS ⇄ Lớp (id `class__student`) | studentId, classId |
| `classTeachers` | GV ⇄ Lớp (id `class__uid`)     | teacherId, classId |
| `attendance`    | Điểm danh (id `class__date__student`) | classId, date, studentId, present, note |
| `scores`        | Điểm (id `class__exam__student`) | classId, studentId, examName, score, maxScore, date |

## Ghi chú bảo mật

Trang phụ huynh chạy **không cần đăng nhập**, nên `students`, `enrollments`, `attendance`, `scores`, `classes` để **đọc công khai** (studentId đóng vai trò mã bí mật). Nếu cần bảo mật chặt hơn, xem phần *Hardened alternative* ở cuối `firestore.rules` (chuyển sang Cloud Function). Ghi dữ liệu luôn yêu cầu tài khoản đã được duyệt.

## Scripts

```bash
npm run dev       # chạy dev
npm run build     # build production
npm run preview   # xem thử bản build
npm run lint      # kiểm tra type
```
