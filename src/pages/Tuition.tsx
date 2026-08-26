import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, QrCode, RefreshCcw, Settings, Wallet, XCircle, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  fmtCurrency,
  getClasses,
  getClassPaymentConfig,
  getClassRoster,
  getTuitionForMonth,
  saveClassPaymentConfig,
  setTuitionPaymentStatus,
} from '../services/dataService';
import { ClassItem, ClassPaymentConfig, TuitionData, TuitionStudentRow, Student } from '../types';
import ZaloSendDialog from '../components/ZaloSendDialog';
import { type ZaloRecipient } from '../services/zaloService';
import {
  buildTransferNote,
  buildVietQrUrl,
  currentMonthKey,
  getEffectivePaymentConfig,
  getGlobalPaymentConfig,
  isPaymentConfigReady,
  monthLabel,
} from '../utils/payment';

type PreviewState = {
  row: TuitionStudentRow;
  qrUrl: string;
  transferNote: string;
} | null;

const EMPTY_CLASS_CONFIG: ClassPaymentConfig = {
  classId: '',
  mode: 'GLOBAL',
  bankId: '',
  bankAccount: '',
  bankAccountName: '',
  qrTemplate: 'compact2',
  notePattern: '{CLASS}_{STUDENT}_HP THANG {MONTH}',
  isEnabled: true,
};

export default function Tuition() {
  const { user } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [tuition, setTuition] = useState<TuitionData | null>(null);
  const [configDraft, setConfigDraft] = useState<ClassPaymentConfig>(EMPTY_CLASS_CONFIG);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingStudent, setSavingStudent] = useState('');
  const [preview, setPreview] = useState<PreviewState>(null);
  const [roster, setRoster] = useState<Student[]>([]);
  const [showZaloDialog, setShowZaloDialog] = useState(false);
  const [zaloRecipients, setZaloRecipients] = useState<ZaloRecipient[]>([]);

  useEffect(() => {
    if (!user) return;
    getClasses(user)
      .then(setClasses)
      .catch((e) => toast(e instanceof Error ? e.message : 'Lỗi tải lớp', 'error'));
  }, [toast, user]);

  useEffect(() => {
    if (!selectedClass) {
      setTuition(null);
      return;
    }
    loadTuition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, monthKey]);

  async function loadTuition() {
    if (!selectedClass) return;
    setLoading(true);
    try {
      const [t, cfg, classRoster] = await Promise.all([
        getTuitionForMonth(selectedClass, monthKey),
        getClassPaymentConfig(selectedClass),
        getClassRoster(selectedClass),
      ]);
      setTuition(t);
      setRoster(classRoster);
      setConfigDraft(cfg || { ...EMPTY_CLASS_CONFIG, classId: selectedClass });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải học phí', 'error');
    } finally {
      setLoading(false);
    }
  }

  const selectedCls = classes.find((c) => c.id === selectedClass);
  const globalConfig = useMemo(() => getGlobalPaymentConfig(), []);
  const effectiveConfig = useMemo(() => getEffectivePaymentConfig(configDraft), [configDraft]);
  const configReady = isPaymentConfigReady(effectiveConfig);

  function makePaymentInfo(row: TuitionStudentRow) {
    const transferNote = buildTransferNote({
      pattern: effectiveConfig.notePattern,
      className: tuition?.classInfo.className || selectedCls?.className || '',
      studentName: row.fullName,
      monthKey,
    });

    const qrUrl = buildVietQrUrl({
      bankId: effectiveConfig.bankId,
      bankAccount: effectiveConfig.bankAccount,
      bankAccountName: effectiveConfig.bankAccountName,
      amount: row.tuition,
      addInfo: transferNote,
      template: effectiveConfig.qrTemplate,
    });

    return { transferNote, qrUrl };
  }

  async function saveConfig() {
    if (!selectedClass || !user) return;

    if (configDraft.mode === 'CLASS') {
      if (!configDraft.bankId.trim() || !configDraft.bankAccount.trim() || !configDraft.bankAccountName.trim()) {
        toast('Vui lòng nhập đủ ngân hàng, số tài khoản và tên tài khoản của lớp', 'warning');
        return;
      }
    }

    setSavingConfig(true);
    try {
      await saveClassPaymentConfig(
        selectedClass,
        {
          ...configDraft,
          classId: selectedClass,
          qrTemplate: 'compact2',
          notePattern: '{CLASS}_{STUDENT}_HP THANG {MONTH}',
        },
        user.id
      );
      toast('Đã lưu cấu hình QR học phí', 'success');
      await loadTuition();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu cấu hình', 'error');
    } finally {
      setSavingConfig(false);
    }
  }

  async function copyText(text: string, label = 'Đã sao chép') {
    await navigator.clipboard?.writeText(text);
    toast(label, 'success');
  }

  async function setPaid(row: TuitionStudentRow, paid: boolean) {
    if (!user || !selectedClass) return;
    const { transferNote } = makePaymentInfo(row);
    setSavingStudent(row.studentId);
    try {
      await setTuitionPaymentStatus({
        classId: selectedClass,
        studentId: row.studentId,
        monthKey,
        amount: row.tuition,
        transferNote,
        status: paid ? 'PAID' : 'UNPAID',
        confirmedBy: user.id,
        confirmedByName: user.name,
      });
      toast(paid ? 'Đã xác nhận đã thu học phí' : 'Đã hủy xác nhận đã thu', 'success');
      await loadTuition();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi cập nhật trạng thái', 'error');
    } finally {
      setSavingStudent('');
    }
  }

  const total = tuition?.students.reduce((sum, s) => sum + s.tuition, 0) || 0;
  const paidTotal =
    tuition?.students
      .filter((s) => s.paymentStatus === 'PAID')
      .reduce((sum, s) => sum + s.tuition, 0) || 0;

  const studentById = useMemo(() => new Map(roster.map((student) => [student.id, student])), [roster]);
  const unpaidRows = tuition?.students.filter((row) => row.paymentStatus !== 'PAID' && row.tuition > 0) || [];

  function tuitionRecipient(row: TuitionStudentRow): ZaloRecipient {
    const student = studentById.get(row.studentId);
    const info = makePaymentInfo(row);
    const paid = row.paymentStatus === 'PAID';
    return {
      id: row.studentId,
      name: row.fullName,
      phone: student?.parentPhone || '',
      message: [
        `Kính gửi phụ huynh${student?.parentName ? ` ${student.parentName}` : ''},`,
        paid
          ? `Trung tâm xác nhận đã thu học phí ${monthLabel(monthKey)} của học sinh ${row.fullName}.`
          : `Trung tâm gửi thông tin học phí ${monthLabel(monthKey)} của học sinh ${row.fullName}.`,
        `Số buổi đã học: ${row.sessionsAttended}/${row.sessionsTotal}.`,
        `Số tiền: ${fmtCurrency(row.tuition)}.`,
        `Nội dung chuyển khoản: ${info.transferNote}.`,
        !paid ? `Thanh toán/QR: ${window.location.origin}/pay/${row.studentId}` : '',
        '',
        'Trân trọng.',
      ].filter(Boolean).join('\n'),
    };
  }

  function openTuitionZalo(rowsToSend: TuitionStudentRow[]) {
    if (!selectedClass || rowsToSend.length === 0) {
      toast('Không có học sinh phù hợp để gửi thông báo học phí', 'warning');
      return;
    }
    setZaloRecipients(rowsToSend.map(tuitionRecipient));
    setShowZaloDialog(true);
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Wallet size={26} /> <span>Học phí</span>
          </h1>
          <p className="page-sub">Tạo QR học phí theo tháng và xác nhận đã thu thủ công</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Lớp học</label>
              <select
                className="form-select"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="">-- Chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.className}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tháng học phí</label>
              <input
                className="form-control"
                type="month"
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {selectedClass && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} /> Cấu hình QR học phí — {selectedCls?.className}
          </div>
          <div className="card-body">
            <div className="payment-mode-row">
              <label className="radio-card">
                <input
                  type="radio"
                  checked={configDraft.mode !== 'CLASS'}
                  onChange={() => setConfigDraft((p) => ({ ...p, mode: 'GLOBAL' }))}
                />
                <span>
                  <strong>Dùng tài khoản chung của trung tâm</strong>
                  <small>
                    {globalConfig.bankId || 'BANK'} · {globalConfig.bankAccount || 'Số tài khoản'} ·{' '}
                    {globalConfig.bankAccountName || 'Tên tài khoản'}
                  </small>
                </span>
              </label>
              <label className="radio-card">
                <input
                  type="radio"
                  checked={configDraft.mode === 'CLASS'}
                  onChange={() => setConfigDraft((p) => ({ ...p, mode: 'CLASS' }))}
                />
                <span>
                  <strong>Dùng tài khoản riêng cho lớp này</strong>
                  <small>Phù hợp nếu mỗi giáo viên/lớp nhận tiền riêng</small>
                </span>
              </label>
            </div>

            {configDraft.mode === 'CLASS' && (
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Mã ngân hàng VietQR</label>
                  <input
                    className="form-control"
                    value={configDraft.bankId}
                    onChange={(e) =>
                      setConfigDraft((p) => ({ ...p, bankId: e.target.value.toUpperCase() }))
                    }
                    placeholder="VD: MB, VCB, ACB..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Số tài khoản</label>
                  <input
                    className="form-control"
                    value={configDraft.bankAccount}
                    onChange={(e) => setConfigDraft((p) => ({ ...p, bankAccount: e.target.value }))}
                    placeholder="Số tài khoản nhận tiền"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tên tài khoản</label>
                  <input
                    className="form-control"
                    value={configDraft.bankAccountName}
                    onChange={(e) =>
                      setConfigDraft((p) => ({ ...p, bankAccountName: e.target.value.toUpperCase() }))
                    }
                    placeholder="NGUYEN VAN A"
                  />
                </div>
              </div>
            )}

            <div className="payment-config-preview">
              <div>
                <div className="form-label">Mẫu nội dung chuyển khoản</div>
                <code>{'{CLASS}_{STUDENT}_HP THANG {MONTH}'}</code>
              </div>
              <div>
                <div className="form-label">Ví dụ</div>
                <code>
                  {buildTransferNote({
                    className: selectedCls?.className || 'T8',
                    studentName: 'Nguyễn Hữu Phúc',
                    monthKey,
                  })}
                </code>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={saveConfig} disabled={savingConfig}>
                {savingConfig ? 'Đang lưu...' : 'Lưu cấu hình QR'}
              </button>
              <button className="btn btn-ghost" onClick={loadTuition} disabled={loading}>
                <RefreshCcw size={15} /> Tải lại
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải học phí...</span>
        </div>
      )}

      {!loading && tuition && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div
            className="card-header"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}
          >
            <span>
              Học phí {monthLabel(monthKey)} — {tuition.classInfo.className}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>
                Đã thu {fmtCurrency(paidTotal)} / {fmtCurrency(total)}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => openTuitionZalo(unpaidRows)}
                disabled={unpaidRows.length === 0}
                title="Gửi nhắc học phí cho các phụ huynh chưa thanh toán"
              >
                <MessageCircle size={14} /> Zalo chưa thu ({unpaidRows.length})
              </button>
            </div>
          </div>

          {!configReady && (
            <div className="payment-warning">
              Chưa đủ cấu hình ngân hàng. Kiểm tra biến môi trường VITE_BANK_ID,
              VITE_BANK_ACCOUNT, VITE_BANK_ACCOUNT_NAME hoặc nhập tài khoản riêng cho lớp.
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Học sinh</th>
                  <th style={{ textAlign: 'center' }}>Đã học</th>
                  <th style={{ textAlign: 'right' }}>Học phí</th>
                  <th>Nội dung CK</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tuition.students.map((s, index) => {
                  const info = makePaymentInfo(s);
                  const paid = s.paymentStatus === 'PAID';
                  return (
                    <tr key={s.studentId} className={paid ? 'row-paid' : undefined}>
                      <td>{index + 1}</td>
                      <td>
                        <strong>{s.fullName}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {s.sessionsAttended}/{s.sessionsTotal}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(s.tuition)}</td>
                      <td>
                        <code className="transfer-note">{info.transferNote}</code>
                      </td>
                      <td>
                        {paid ? (
                          <span className="badge badge-success">Đã thu</span>
                        ) : (
                          <span className="badge badge-warning">Chưa thu</span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => copyText(info.transferNote, 'Đã sao chép nội dung chuyển khoản')}
                        >
                          <Copy size={14} /> Copy
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openTuitionZalo([s])}
                          title="Gửi thông tin học phí qua Zalo"
                        >
                          <MessageCircle size={14} /> Zalo
                        </button>
                        {configReady && s.tuition > 0 && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              setPreview({ row: s, qrUrl: info.qrUrl, transferNote: info.transferNote })
                            }
                          >
                            <QrCode size={14} /> QR
                          </button>
                        )}
                        {paid ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            disabled={savingStudent === s.studentId}
                            onClick={() => setPaid(s, false)}
                          >
                            <XCircle size={14} /> Hủy thu
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={savingStudent === s.studentId || s.tuition <= 0}
                            onClick={() => setPaid(s, true)}
                          >
                            <CheckCircle2 size={14} /> Đã thu
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ZaloSendDialog
        open={showZaloDialog}
        onClose={() => setShowZaloDialog(false)}
        title={`Thông báo học phí — ${selectedCls?.className || ''} — ${monthLabel(monthKey)}`}
        recipients={zaloRecipients}
        log={selectedClass ? { kind: 'TUITION', classId: selectedClass, periodKey: monthKey } : undefined}
      />

      {preview && (
        <div className="overlay" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>QR học phí — {preview.row.fullName}</h3>
              <button className="modal-close" onClick={() => setPreview(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="qr-preview-card">
                <img src={preview.qrUrl} alt="QR học phí" />
                <div>
                  <div className="form-label">Số tiền</div>
                  <h2>{fmtCurrency(preview.row.tuition)}</h2>
                  <div className="form-label">Nội dung chuyển khoản</div>
                  <code>{preview.transferNote}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
