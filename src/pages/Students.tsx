import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Users, Copy, Pencil, Trash2, Wallet, Upload, FileDown, MessageCircle, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getClasses,
  getStudents,
  addStudent,
  updateStudent,
  deleteStudent,
  importStudents,
} from '../services/dataService';
import { ClassItem, Student, Status, Role } from '../types';
import Modal from '../components/Modal';
import ZaloSendDialog from '../components/ZaloSendDialog';
import ZaloConnection from '../components/ZaloConnection';
import { isUsableZaloPhone, type ZaloRecipient } from '../services/zaloService';

interface FormState {
  fullName: string;
  studentClass: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  note: string;
  status: Status;
}

const EMPTY: FormState = {
  fullName: '',
  studentClass: '',
  parentName: '',
  parentPhone: '',
  parentEmail: '',
  note: '',
  status: 'ACTIVE',
};

const TEMPLATE_HEADERS = [
  'Họ tên học sinh *',
  'Lớp hành chính',
  'Tên phụ huynh',
  'SĐT phụ huynh',
  'Email phụ huynh',
  'Ghi chú',
  'Trạng thái',
];

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');

const cellText = (value: unknown) => String(value ?? '').trim();

function normalizeImportedPhone(value: unknown) {
  let phone = cellText(value).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (phone.startsWith('+84')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('84') && phone.length >= 11) phone = `0${phone.slice(2)}`;
  // Excel thường biến 0901234567 thành số 901234567 và làm mất số 0 đầu.
  if (!phone.startsWith('0') && /^\d{9,10}$/.test(phone)) phone = `0${phone}`;
  return phone;
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const normalizedCells = new Map<string, unknown>();
  Object.entries(row).forEach(([key, value]) => {
    normalizedCells.set(normalizeHeader(key), value);
  });

  for (const alias of aliases) {
    const value = normalizedCells.get(normalizeHeader(alias));
    if (value !== undefined) return cellText(value);
  }

  return '';
}

function parseStatus(value: string): Status {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    normalized.includes('nghi') ||
    normalized.includes('inactive') ||
    normalized.includes('off')
  ) {
    return 'INACTIVE';
  }

  return 'ACTIVE';
}

async function parseStudentExcel(file: File): Promise<FormState[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File Excel không có sheet dữ liệu');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  return rawRows
    .filter((row) => Object.values(row).some((value) => cellText(value)))
    .map((row) => ({
      fullName: getCell(row, [
        'Họ tên học sinh *',
        'Họ tên học sinh',
        'fullName',
        'Tên học sinh',
      ]),
      studentClass: getCell(row, ['Lớp hành chính', 'Lớp', 'studentClass']),
      parentName: getCell(row, ['Tên phụ huynh', 'Phụ huynh', 'parentName']),
      parentPhone: normalizeImportedPhone(
        getCell(row, [
          'SĐT phụ huynh',
          'Số điện thoại phụ huynh',
          'Điện thoại',
          'parentPhone',
        ])
      ),
      parentEmail: getCell(row, ['Email phụ huynh', 'Email', 'parentEmail']),
      note: getCell(row, ['Ghi chú', 'note']),
      status: parseStatus(getCell(row, ['Trạng thái', 'status'])),
    }));
}

function downloadStudentTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    [
      'Nguyễn Văn A',
      '8A',
      'Nguyễn Văn B',
      '0901234567',
      'phuhuynh1@gmail.com',
      'Học thử',
      'ACTIVE',
    ],
    [
      'Trần Thị C',
      '8A',
      'Trần Văn D',
      '0912345678',
      'phuhuynh2@gmail.com',
      '',
      'ACTIVE',
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 28 },
    { wch: 24 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'HocSinh');
  XLSX.writeFile(workbook, 'mau_import_hoc_sinh.xlsx');
}

export default function Students() {
  const { user } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importClassId, setImportClassId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showZaloConnection, setShowZaloConnection] = useState(false);
  const [zaloRecipients, setZaloRecipients] = useState<ZaloRecipient[]>([]);
  const [showZaloDialog, setShowZaloDialog] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const studentList = await getStudents();
        setStudents(studentList);

        if (user) {
          const classList = await getClasses(user);
          setClasses(classList);
        }
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Lỗi tải dữ liệu', 'error');
      } finally {
        setLoading(false);
      }
    }

    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      fullName: s.fullName,
      studentClass: s.studentClass,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      parentEmail: s.parentEmail,
      note: s.note,
      status: s.status,
    });
    setShowModal(true);
  };

  const handleDelete = async (s: Student) => {
    if (
      !window.confirm(
        `Xóa học sinh "${s.fullName}"? Toàn bộ dữ liệu điểm danh và điểm số liên quan sẽ bị xóa và không thể hoàn tác.`
      )
    )
      return;
    try {
      await deleteStudent(s.id);
      toast('Đã xóa học sinh', 'success');
      setStudents((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi xóa', 'error');
    }
  };

  const save = async () => {
    if (!form.fullName.trim()) {
      toast('Vui lòng nhập tên học sinh', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateStudent(editing.id, form);
        toast('Đã cập nhật học sinh');
        setStudents((prev) =>
          prev.map((s) => (s.id === editing.id ? { ...s, ...form } : s))
        );
      } else {
        const ref = await addStudent(form);
        toast('Đã thêm học sinh mới');
        setStudents((prev) =>
          [...prev, { id: ref.id, ...form }].sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          )
        );
      }
      setShowModal(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImportExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const rows = await parseStudentExcel(file);
      if (rows.length === 0) {
        toast('File Excel không có dữ liệu học sinh', 'warning');
        return;
      }

      const result = await importStudents(rows, importClassId || undefined);
      setStudents(await getStudents());

      const selectedClass = classes.find((item) => item.id === importClassId);
      const classText = selectedClass
        ? `, đã đưa vào lớp ${selectedClass.className}`
        : '';

      toast(
        `Import xong: tạo mới ${result.created}, đã có sẵn ${result.existed}, bỏ qua ${result.skipped}${classText}`,
        result.errors.length > 0 ? 'warning' : 'success'
      );

      if (result.errors.length > 0) {
        console.warn('Import học sinh có cảnh báo:', result.errors);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Lỗi import Excel', 'error');
    } finally {
      setImporting(false);
    }
  };

  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(q.toLowerCase()) ||
      s.studentClass.toLowerCase().includes(q.toLowerCase()) ||
      s.parentPhone.includes(q) ||
      s.id.includes(q)
  );

  const parentLink = (sid: string) => `${window.location.origin}/parent/${sid}`;

  const payLink = (sid: string) => `${window.location.origin}/pay/${sid}`;

  const toZaloRecipient = (student: Student): ZaloRecipient => ({
    id: student.id,
    name: student.fullName,
    phone: student.parentPhone,
    message: [
      `Kính gửi phụ huynh${student.parentName ? ` ${student.parentName}` : ''},`,
      `Trung tâm gửi thông tin của học sinh ${student.fullName}.`,
      `Xem báo cáo: ${parentLink(student.id)}`,
      `Thanh toán học phí: ${payLink(student.id)}`,
      '',
      'Trân trọng.',
    ].join('\n'),
  });

  const openZaloForStudent = (student: Student) => {
    setZaloRecipients([toZaloRecipient(student)]);
    setShowZaloDialog(true);
  };

  const openZaloForSelected = () => {
    const recipients = students
      .filter((student) => selectedIds.has(student.id))
      .map(toZaloRecipient);
    if (recipients.length === 0) {
      toast('Vui lòng chọn ít nhất một học sinh', 'warning');
      return;
    }
    setZaloRecipients(recipients);
    setShowZaloDialog(true);
  };

  const toggleStudent = (studentId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((student) => {
        if (checked) next.add(student.id);
        else next.delete(student.id);
      });
      return next;
    });
  };

  const copyLink = (sid: string) => {
    navigator.clipboard?.writeText(parentLink(sid));
    toast('Đã sao chép link phụ huynh');
  };

  const copyPayLink = (sid: string) => {
    navigator.clipboard?.writeText(payLink(sid));
    toast('Đã sao chép link thanh toán học phí');
  };

  if (loading)
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users size={26} /> <span>Học sinh</span>
          </h1>
          <p className="page-sub">{students.length} học sinh đã đăng ký</p>
        </div>
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <input
          className="search-box"
          placeholder="Tìm theo tên, lớp, SĐT, mã..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="form-select"
          style={{ maxWidth: 260 }}
          value={importClassId}
          onChange={(e) => setImportClassId(e.target.value)}
          title="Chọn lớp nếu muốn import và xếp lớp luôn"
        >
          <option value="">Import: chỉ thêm học sinh</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              Import vào lớp {item.className}
            </option>
          ))}
        </select>

        <button className="btn btn-secondary" onClick={downloadStudentTemplate}>
          <FileDown size={16} /> Tải file mẫu
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={handleImportExcel}
        />

        <button
          className="btn btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          <Upload size={16} /> {importing ? 'Đang import...' : 'Import Excel'}
        </button>

        {user?.role === Role.ADMIN && (
          <button
            className="btn btn-secondary"
            onClick={() => setShowZaloConnection((value) => !value)}
          >
            <Link2 size={16} /> {showZaloConnection ? 'Ẩn kết nối Zalo' : 'Kết nối Zalo'}
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={openZaloForSelected}
          disabled={selectedIds.size === 0}
          title="Gửi tin nhắn Zalo đến các phụ huynh đã chọn"
        >
          <MessageCircle size={16} /> Gửi Zalo ({selectedIds.size})
        </button>

        <button className="btn btn-primary" onClick={openAdd}>
          + Thêm học sinh
        </button>
      </div>

      {showZaloConnection && user?.role === Role.ADMIN && <ZaloConnection />}

      <div className="card">
        {filtered.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">
                <Users size={40} />
              </div>
              <h3>{q ? 'Không tìm thấy' : 'Chưa có học sinh'}</h3>
              <p>{!q && 'Nhấn "+ Thêm học sinh" hoặc "Import Excel" để bắt đầu'}</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 42 }}>
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả học sinh đang hiển thị"
                      checked={filtered.length > 0 && filtered.every((student) => selectedIds.has(student.id))}
                      onChange={(e) => toggleAllFiltered(e.target.checked)}
                    />
                  </th>
                  <th>Mã</th>
                  <th>Họ tên</th>
                  <th>Lớp</th>
                  <th>Phụ huynh</th>
                  <th>SĐT</th>
                  <th>Trạng thái</th>
                  <th>Link chia sẻ</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${s.fullName}`}
                        checked={selectedIds.has(s.id)}
                        onChange={(e) => toggleStudent(s.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {s.id.slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      <strong>{s.fullName}</strong>
                      {s.note && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {s.note}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: 'var(--bg-light)', color: 'var(--text)' }}
                      >
                        {s.studentClass || '—'}
                      </span>
                    </td>
                    <td>{s.parentName || '—'}</td>
                    <td>{s.parentPhone || '—'}</td>
                    <td>
                      <span
                        className={`badge ${
                          s.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'
                        }`}
                      >
                        {s.status === 'ACTIVE' ? 'Đang học' : 'Nghỉ'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => copyLink(s.id)}
                          title="Link báo cáo cho phụ huynh"
                        >
                          <Copy size={14} /> Báo cáo
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--primary)' }}
                          onClick={() => copyPayLink(s.id)}
                          title="Link thanh toán học phí"
                        >
                          <Wallet size={14} /> Học phí
                        </button>
                      </div>
                    </td>
                    <td className="actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openZaloForStudent(s)}
                        disabled={!isUsableZaloPhone(s.parentPhone)}
                        title={isUsableZaloPhone(s.parentPhone) ? 'Gửi Zalo cho phụ huynh' : 'Chưa có số điện thoại hợp lệ'}
                      >
                        <MessageCircle size={14} /> Zalo
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 4 }} onClick={() => openEdit(s)}>
                        <Pencil size={14} /> Sửa
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)', marginLeft: 4 }}
                        onClick={() => handleDelete(s)}
                      >
                        <Trash2 size={14} /> Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ZaloSendDialog
        open={showZaloDialog}
        onClose={() => setShowZaloDialog(false)}
        title={zaloRecipients.length > 1 ? `Gửi Zalo cho ${zaloRecipients.length} phụ huynh` : 'Gửi Zalo cho phụ huynh'}
        recipients={zaloRecipients}
      />

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Sửa thông tin học sinh' : 'Thêm học sinh mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Họ tên học sinh *</label>
            <input
              className="form-control"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Nguyễn Văn A"
              autoFocus
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Lớp</label>
            <input
              className="form-control"
              value={form.studentClass}
              onChange={(e) => setForm((f) => ({ ...f, studentClass: e.target.value }))}
              placeholder="12A1"
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên phụ huynh</label>
            <input
              className="form-control"
              value={form.parentName}
              onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
              placeholder="Nguyễn Văn B"
            />
          </div>
          <div className="form-group">
            <label className="form-label">SĐT phụ huynh</label>
            <input
              className="form-control"
              type="tel"
              value={form.parentPhone}
              onChange={(e) => setForm((f) => ({ ...f, parentPhone: e.target.value }))}
              placeholder="0901..."
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email phụ huynh</label>
            <input
              className="form-control"
              type="email"
              value={form.parentEmail}
              onChange={(e) => setForm((f) => ({ ...f, parentEmail: e.target.value }))}
              placeholder="email@gmail.com"
            />
          </div>
          {editing && (
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select
                className="form-select"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as Status }))
                }
              >
                <option value="ACTIVE">Đang học</option>
                <option value="INACTIVE">Nghỉ học</option>
              </select>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Ghi chú</label>
          <input
            className="form-control"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Ghi chú thêm..."
          />
        </div>
      </Modal>
    </div>
  );
}
