import { MessageCircle } from 'lucide-react';
import ZaloConnection from '../components/ZaloConnection';

export default function Zalo() {
  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <MessageCircle size={26} /> <span>Zalo</span>
          </h1>
          <p className="page-sub">
            Kết nối tài khoản Zalo dùng chung của trung tâm. Sau khi kết nối, có thể gửi thông báo từ Học sinh, Điểm danh, Điểm số và Học phí.
          </p>
        </div>
      </div>
      <ZaloConnection />
    </div>
  );
}
