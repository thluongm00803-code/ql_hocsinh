import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileText, MessageCircle, Paperclip, Send, Trash2 } from 'lucide-react';
import Modal from './Modal';
import {
  fetchZaloSentLog,
  isUsableZaloPhone,
  sendZaloBulk,
  sendZaloFiles,
  sendZaloMessage,
  waitForZaloJob,
  type ZaloJob,
  type ZaloLogRef,
  type ZaloRecipient,
  type ZaloSentMap,
} from '../services/zaloService';
import {
  MAX_FILES,
  fmtSize,
  prepareFiles,
  stripPreview,
  type ZaloFileInput,
} from '../services/zaloFiles';

interface Props {
  open: boolean;
  title: string;
  recipients: ZaloRecipient[];
  onClose: () => void;
  allowAttachments?: boolean;
  log?: ZaloLogRef;
  onSent?: () => void;
}

type SendState = 'idle' | 'sending' | 'queued' | 'done' | 'error';

export default function ZaloSendDialog({
  open,
  title,
  recipients,
  onClose,
  allowAttachments = true,
  log,
  onSent,
}: Props) {
  const [singleMessage, setSingleMessage] = useState('');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<SendState>('idle');
  const [error, setError] = useState('');
  const [job, setJob] = useState<ZaloJob | null>(null);
  const [files, setFiles] = useState<ZaloFileInput[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [confirmShared, setConfirmShared] = useState(false);
  const [sentLog, setSentLog] = useState<ZaloSentMap>({});
  const [confirmResend, setConfirmResend] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSingleMessage(recipients.length === 1 ? recipients[0]?.message || '' : '');
    setComment('');
    setState('idle');
    setError('');
    setJob(null);
    setFiles([]);
    setConfirmShared(false);
    setConfirmResend(false);
    setSentLog({});
    if (log) {
      void fetchZaloSentLog(log).then(setSentLog).catch(() => setSentLog({}));
    }
  }, [open, recipients, log?.kind, log?.classId, log?.periodKey]);

  const validRecipients = useMemo(
    () => recipients.filter((recipient) => isUsableZaloPhone(recipient.phone)),
    [recipients]
  );
  const missingPhone = recipients.length - validRecipients.length;
  const isBulk = recipients.length > 1;
  const alreadySent = validRecipients.filter((recipient) => Boolean(sentLog[recipient.id]));

  function withComment(message: string) {
    const note = comment.trim();
    return note ? `${message.trim()}\n\nNhận xét: ${note}` : message.trim();
  }

  const preview = isBulk && validRecipients[0] ? withComment(validRecipients[0].message) : singleMessage;

  async function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked: File[] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!picked.length) return;
    setPreparing(true);
    setError('');
    try {
      const room = MAX_FILES - files.length;
      if (room <= 0) throw new Error(`Đã đủ ${MAX_FILES} file.`);
      const fresh = await prepareFiles(picked.slice(0, room));
      setFiles((prev) => [...prev, ...fresh]);
      setConfirmShared(false);
      if (picked.length > room) setError(`Chỉ thêm được ${room} file; các file còn lại đã bỏ qua.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xử lý được file.');
    } finally {
      setPreparing(false);
    }
  }

  async function send() {
    if (!validRecipients.length) {
      setError('Không có phụ huynh nào có số điện thoại hợp lệ.');
      setState('error');
      return;
    }

    if (isBulk && files.length > 0 && !confirmShared) {
      setError('Hãy xác nhận file đính kèm không chứa thông tin riêng của học sinh khác.');
      setState('error');
      return;
    }

    if (alreadySent.length > 0 && !confirmResend) {
      setError(`Có ${alreadySent.length} người đã được gửi thông báo này trước đó. Hãy xác nhận nếu muốn gửi lại.`);
      setState('error');
      return;
    }

    const sharedFiles = files.length ? stripPreview(files) : undefined;
    const payload = isBulk
      ? validRecipients.map((recipient) => ({ ...recipient, message: withComment(recipient.message) }))
      : [{ ...validRecipients[0], message: singleMessage.trim() }];

    if (!sharedFiles && payload.some((recipient) => !recipient.message)) {
      setError('Nội dung tin nhắn không được để trống.');
      setState('error');
      return;
    }

    setState('sending');
    setError('');
    setJob(null);

    try {
      let jobId: string;
      if (payload.length === 1) {
        const only = payload[0];
        const attach = only.files?.length ? stripPreview(only.files) : sharedFiles;
        jobId = attach
          ? await sendZaloFiles({ ...only, files: attach }, log)
          : await sendZaloMessage(only, log);
      } else {
        jobId = await sendZaloBulk(
          payload.map((recipient) => ({
            ...recipient,
            files: recipient.files?.length ? stripPreview(recipient.files) : sharedFiles,
          })),
          log
        );
      }

      onSent?.();
      setState('queued');
      const result = await waitForZaloJob(jobId, setJob);
      if (!result || result.status !== 'done') return;
      setState('done');
      if (result.failed > 0) {
        setError(`${result.failed}/${result.total} tin gửi thất bại. Xem kết quả phía dưới.`);
      }
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Không gửi được Zalo.');
    }
  }

  const busy = state === 'sending' || preparing;
  const locked = busy || state === 'done';
  const totalBytes = files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button className="btn btn-primary" onClick={send} disabled={locked || preparing}>
            <Send size={15} />
            {state === 'sending' ? 'Đang gửi...' : state === 'queued' ? 'Đã vào hàng đợi' : state === 'done' ? 'Đã gửi xong' : 'Gửi Zalo'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="badge badge-success"><MessageCircle size={13} /> {validRecipients.length} người nhận</span>
        {missingPhone > 0 && <span className="badge badge-danger">{missingPhone} thiếu/sai SĐT</span>}
        {alreadySent.length > 0 && <span className="badge badge-warning">{alreadySent.length} đã gửi trước đó</span>}
        {files.length > 0 && <span className="badge"><FileText size={13} /> {files.length} file · {fmtSize(totalBytes)}</span>}
        {job && <span className="badge">Tiến độ {job.sent + job.failed}/{job.total}</span>}
      </div>

      {isBulk ? (
        <>
          <div className="form-group">
            <label className="form-label">Nhận xét chung (không bắt buộc)</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Nội dung này sẽ được thêm cuối tin nhắn riêng của từng học sinh..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={locked}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Xem trước — {validRecipients[0]?.name || 'chưa có người nhận'}</label>
            <textarea className="form-control" rows={8} readOnly value={preview} />
          </div>
        </>
      ) : (
        <div className="form-group">
          <label className="form-label">Nội dung tin nhắn</label>
          <textarea
            className="form-control"
            rows={10}
            value={singleMessage}
            onChange={(e) => setSingleMessage(e.target.value)}
            disabled={locked}
          />
        </div>
      )}

      {allowAttachments && (
        <div className="form-group">
          <label className="form-label">Ảnh / file đính kèm (tối đa {MAX_FILES})</label>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={onPickFiles}
            hidden
            disabled={locked || files.length >= MAX_FILES}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInput.current?.click()}
            disabled={locked || preparing || files.length >= MAX_FILES}
          >
            <Paperclip size={14} /> {preparing ? 'Đang xử lý...' : 'Chọn ảnh hoặc file'}
          </button>

          {files.length > 0 && (
            <div style={{ marginTop: 9, display: 'grid', gap: 7 }}>
              {files.map((file, index) => (
                <div key={`${file.filename}_${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span style={{ fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.filename} {file.sizeBytes ? `(${fmtSize(file.sizeBytes)})` : ''}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))} disabled={locked}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isBulk && files.length > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: '.82rem' }}>
              <input type="checkbox" checked={confirmShared} onChange={(e) => setConfirmShared(e.target.checked)} disabled={locked} />
              <span>Tôi xác nhận file này dùng chung cho tất cả người nhận và không chứa dữ liệu riêng của học sinh khác.</span>
            </label>
          )}
        </div>
      )}

      {alreadySent.length > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: '.82rem' }}>
          <input type="checkbox" checked={confirmResend} onChange={(e) => setConfirmResend(e.target.checked)} disabled={locked} />
          <span>
            Tôi xác nhận muốn gửi lại cho {alreadySent.length} người đã nhận thông báo cùng kỳ trước đó.
          </span>
        </label>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: '.84rem', marginTop: 8 }}>{error}</div>}

      {job?.results?.length ? (
        <div style={{ maxHeight: 150, overflow: 'auto', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {job.results.map((result, index) => (
            <div key={`${result.to}_${index}`} style={{ fontSize: '.8rem', padding: '3px 0', color: result.ok ? '#15803d' : 'var(--danger)' }}>
              {result.ok ? '✓' : '✕'} {result.to}{result.error ? ` — ${result.error}` : ''}
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
