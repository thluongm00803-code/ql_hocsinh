import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Link2, Loader2, QrCode, RefreshCcw } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  getZaloHealth,
  getZaloLoginState,
  startZaloLogin,
  type ZaloHealth,
  type ZaloLoginState,
} from '../services/zaloService';

const phaseLabel: Record<string, string> = {
  idle: 'Chưa bắt đầu',
  waiting_scan: 'Đang chờ quét mã',
  scanned: 'Đã quét — hãy bấm Đồng ý trên điện thoại',
  done: 'Đã kết nối',
  expired: 'Mã QR đã hết hạn',
  declined: 'Đã từ chối trên điện thoại',
  error: 'Không kết nối được',
};

function fmtTime(iso?: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export default function ZaloConnection() {
  const toast = useToast();
  const [health, setHealth] = useState<ZaloHealth | null>(null);
  const [login, setLogin] = useState<ZaloLoginState>({ phase: 'idle' });
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await getZaloHealth());
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Không lấy được tình trạng Zalo', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(async () => {
      try {
        const state = await getZaloLoginState();
        setLogin(state);
        if (['done', 'declined', 'error', 'expired'].includes(state.phase)) {
          setPolling(false);
          if (state.phase === 'done') {
            void refreshHealth();
            toast('Đã kết nối tài khoản Zalo', 'success');
          }
        }
      } catch {
        // Lỗi tạm thời: lượt poll tiếp theo sẽ thử lại.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [polling, refreshHealth, toast]);

  async function start() {
    setStarting(true);
    try {
      await startZaloLogin();
      setLogin({ phase: 'waiting_scan' });
      setPolling(true);
      setCopied(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Không tạo được mã QR', 'error');
    } finally {
      setStarting(false);
    }
  }

  async function copySession() {
    if (!login.sessionB64) return;
    await navigator.clipboard?.writeText(login.sessionB64);
    setCopied(true);
    toast('Đã sao chép chuỗi phiên Zalo', 'success');
    window.setTimeout(() => setCopied(false), 2500);
  }

  const connected = health?.zalo === 'ready';
  const scanning = ['waiting_scan', 'scanned'].includes(login.phase);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link2 size={20} /> Kết nối Zalo
            </h3>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '.86rem' }}>
              Tài khoản dùng để gửi thông báo cho phụ huynh.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => void refreshHealth()} disabled={loading}>
            <RefreshCcw size={14} /> Kiểm tra lại
          </button>
        </div>

        {loading ? (
          <div className="loading-state" style={{ minHeight: 90 }}>
            <Loader2 size={18} className="spinner" /> <span>Đang kiểm tra Zalo...</span>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: connected ? '#15803d' : '#b45309' }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: 'currentColor', display: 'inline-block' }} />
              {connected ? 'Zalo đang hoạt động' : health?.lastError || 'Zalo chưa kết nối'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginTop: 12 }}>
              <div className="badge" style={{ padding: '9px 12px' }}>Kết nối: {fmtTime(health?.connectedAt)}</div>
              <div className="badge" style={{ padding: '9px 12px' }}>Còn hôm nay: {health?.quotaLeft ?? '—'} tin</div>
              <div className="badge" style={{ padding: '9px 12px' }}>Hàng đợi: {health?.queueDepth ?? 0} tin</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {!scanning && login.phase !== 'done' && (
            <>
              <p style={{ margin: '0 0 10px', fontSize: '.86rem', color: 'var(--text-muted)' }}>
                Khi cần đổi/khôi phục tài khoản: tạo QR, mở Zalo trên điện thoại và quét mã.
              </p>
              <button className="btn btn-primary btn-sm" onClick={start} disabled={starting}>
                {starting ? <Loader2 size={15} /> : <QrCode size={15} />}
                {starting ? 'Đang tạo mã...' : 'Tạo mã QR đăng nhập'}
              </button>
            </>
          )}

          {scanning && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <strong>{phaseLabel[login.phase]}{login.name ? ` — ${login.name}` : ''}</strong>
              {login.qrImage ? (
                <img
                  src={`data:image/png;base64,${login.qrImage}`}
                  alt="Mã QR đăng nhập Zalo"
                  width={230}
                  height={230}
                  style={{ borderRadius: 14, border: '1px solid var(--border)', padding: 8, background: '#fff' }}
                />
              ) : (
                <div style={{ width: 230, height: 230, display: 'grid', placeItems: 'center', border: '1px dashed var(--border)', borderRadius: 14 }}>
                  <Loader2 size={26} />
                </div>
              )}
              <button className="btn btn-secondary btn-sm" onClick={start} disabled={starting}>
                <RefreshCcw size={14} /> Tạo mã khác
              </button>
            </div>
          )}

          {login.phase === 'done' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700 }}>
                <CheckCircle2 size={18} /> Đã kết nối{login.name ? ` tài khoản ${login.name}` : ''}.
              </div>
              {login.sessionB64 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '.84rem', color: 'var(--text-muted)' }}>
                    Sao chép chuỗi dưới đây vào biến <strong>ZALO_SESSION</strong> trên Render để giữ phiên sau khi service khởi động lại.
                  </p>
                  <textarea className="form-control" rows={3} readOnly value={login.sessionB64} onClick={(e) => e.currentTarget.select()} />
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={copySession}>
                    <Copy size={14} /> {copied ? 'Đã sao chép' : 'Sao chép chuỗi phiên'}
                  </button>
                  <p style={{ margin: '8px 0 0', color: 'var(--danger)', fontSize: '.78rem' }}>
                    Chuỗi phiên tương đương thông tin đăng nhập. Không gửi cho người khác.
                  </p>
                </div>
              )}
            </div>
          )}

          {['expired', 'declined', 'error'].includes(login.phase) && (
            <p style={{ color: 'var(--danger)', fontSize: '.84rem', marginBottom: 0 }}>
              {phaseLabel[login.phase]}{login.error ? ` — ${login.error}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
