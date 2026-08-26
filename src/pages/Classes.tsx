import { useState, useEffect } from 'react';
import {
  School,
  Users,
  GraduationCap,
  Pencil,
  Copy,
  Calendar,
  Wallet,
  Tag,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getClasses,
  getStudents,
  getClassRoster,
  getClassTeachers,
  addClass,
  updateClass,
  enrollStudent,
  removeEnrollment,
  assignTeacher,
  removeTeacherFromClass,
  fmtCurrency,
  fmtDate,
} from '../services/dataService';
import { getAllUsers } from '../services/authService';
import { AppUser, ClassItem, Role, Status, Student } from '../types';
import Modal from '../components/Modal';

interface ClassForm {
  className: string;
  subject: string;
  grade: string;
  feePerSession: string;
  startDate: string;
  status: Status;
}

const EMPTY_FORM: ClassForm = {
  className: '',
  subject: '',
  grade: '',
  feePerSession: '',
  startDate: '',
  status: 'ACTIVE',
};

export default function Classes() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === Role.ADMIN;

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<ClassItem | null>(null);
  const [detailTab, setDetailTab] = useState<'roster' | 'teachers'>('roster');
  const [roster, setRoster] = useState<Student[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [assignedTeachers, setAssignedTeachers] = useState<AppUser[]>([]);

  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    if (!user) return;
    try {
      const [cls, stu, allUsers] = await Promise.all([
        getClasses(user),
        isAdmin || user.role === Role.TEACHER
          ? getStudents()
          : Promise.resolve([]),
        isAdmin ? getAllUsers() : Promise.resolve([]),
      ]);
      setClasses(cls);
      setStudents(stu);
      setTeachers(
        allUsers.filter(
          (u) => (u.role === Role.TEACHER || u.role === Role.TA) && u.isApproved
        )
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(cls: ClassItem) {
    setDetail(cls);
    setDetailTab('roster');
    setRosterLoading(true);
    try {
      const r = await getClassRoster(cls.id);
      setRoster(r);
      if (isAdmin) setAssignedTeachers(await getClassTeachers(cls.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setRosterLoading(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(cls: ClassItem, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(cls);
    setForm({
      className: cls.className,
      subject: cls.subject,
      grade: cls.grade,
      feePerSession: String(cls.feePerSession),
      startDate: cls.startDate,
      status: cls.status,
    });
    setShowForm(true);
  }

  async function saveClass() {
    if (!form.className.trim()) {
      toast('Vui lòng nhập tên lớp', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        className: form.className,
        subject: form.subject,
        grade: form.grade,
        feePerSession: Number(form.feePerSession) || 0,
        startDate: form.startDate,
        status: form.status,
      };
      if (editing) {
        await updateClass(editing.id, payload);
        toast('Đã cập nhật lớp học');
      } else {
        await addClass(payload);
        toast('Đã tạo lớp học mới');
      }
      setShowForm(false);
      loadAll();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function doEnroll() {
    if (!enrollStudentId || !detail) {
      toast('Chọn học sinh cần thêm', 'warning');
      return;
    }
    setEnrolling(true);
    try {
      await enrollStudent(enrollStudentId, detail.id);
      toast('Đã thêm học sinh vào lớp');
      setEnrollStudentId('');
      setRoster(await getClassRoster(detail.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setEnrolling(false);
    }
  }

  async function doRemoveStudent(studentId: string) {
    if (!detail || !window.confirm('Xóa học sinh khỏi lớp?')) return;
    try {
      await removeEnrollment(studentId, detail.id);
      toast('Đã xóa học sinh khỏi lớp');
      setRoster((r) => r.filter((s) => s.id !== studentId));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  }

  async function doAssignTeacher() {
    if (!assignTeacherId || !detail) {
      toast('Chọn giáo viên/trợ giảng', 'warning');
      return;
    }
    setAssigning(true);
    try {
      await assignTeacher(assignTeacherId, detail.id);
      toast('Đã phân công giáo viên');
      setAssignTeacherId('');
      setAssignedTeachers(await getClassTeachers(detail.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setAssigning(false);
    }
  }

  async function doRemoveTeacher(teacherId: string) {
    if (!detail || !window.confirm('Hủy phân công giáo viên?')) return;
    try {
      await removeTeacherFromClass(teacherId, detail.id);
      toast('Đã hủy phân công');
      setAssignedTeachers((t) => t.filter((x) => x.id !== teacherId));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  }

  const filtered = classes.filter(
    (c) =>
      c.className.toLowerCase().includes(q.toLowerCase()) ||
      c.subject.toLowerCase().includes(q.toLowerCase())
  );
  const unenrolled = students.filter((s) => !roster.find((r) => r.id === s.id));
  const unassigned = teachers.filter(
    (t) => !assignedTeachers.find((a) => a.id === t.id)
  );

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
            <School size={26} /> <span>Lớp học</span>
          </h1>
          <p className="page-sub">
            {isAdmin
              ? `Quản lý ${classes.length} lớp học`
              : `${classes.length} lớp được phân công`}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="search-box"
          placeholder="Tìm lớp học..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            + Tạo lớp mới
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">
                <School size={40} />
              </div>
              <h3>Chưa có lớp học nào</h3>
              <p>
                {isAdmin
                  ? 'Nhấn "Tạo lớp mới" để bắt đầu'
                  : 'Chưa có lớp nào được phân công cho bạn'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {filtered.map((cls) => (
            <div
              key={cls.id}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => openDetail(cls)}
            >
              <div
                className="card-header"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{cls.className}</span>
                <span
                  className="badge"
                  style={{
                    fontSize: '0.7rem',
                    background: 'rgba(255,255,255,0.25)',
                    color: '#fff',
                  }}
                >
                  {cls.status === 'ACTIVE' ? 'Đang học' : 'Dừng'}
                </span>
              </div>
              <div className="card-body" style={{ fontSize: '0.875rem' }}>
                <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {cls.subject && <span className="badge badge-info">{cls.subject}</span>}
                  {cls.grade && <span className="badge badge-warning">Khối {cls.grade}</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} /> {cls.startDate ? fmtDate(cls.startDate) : 'Chưa rõ ngày'}
                </div>
                <div style={{ color: 'var(--primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wallet size={14} /> {fmtCurrency(cls.feePerSession)}/buổi
                </div>
                {isAdmin && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => openEdit(cls, e)}
                    >
                      <Pencil size={14} /> Sửa
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Sửa lớp học' : 'Tạo lớp mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" onClick={saveClass} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên lớp *</label>
            <input
              className="form-control"
              value={form.className}
              onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
              placeholder="VD: Toán 8A"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Môn học</label>
            <input
              className="form-control"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="VD: Toán, Văn, Anh..."
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Khối lớp</label>
            <input
              className="form-control"
              value={form.grade}
              onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
              placeholder="VD: 8"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Học phí / buổi (VND)</label>
            <input
              className="form-control"
              type="number"
              value={form.feePerSession}
              onChange={(e) => setForm((f) => ({ ...f, feePerSession: e.target.value }))}
              placeholder="0"
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ngày bắt đầu</label>
            <input
              className="form-control"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
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
                <option value="INACTIVE">Dừng</option>
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.className || ''}
        size="modal-lg"
      >
        {detail && (
          <>
            <div
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                marginBottom: 16,
                padding: '10px 14px',
                background: 'var(--bg-light)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}
            >
              {detail.subject && (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <BookOpen size={14} /> {detail.subject}
                </span>
              )}
              {detail.grade && (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Tag size={14} /> Khối {detail.grade}
                </span>
              )}
              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Wallet size={14} /> {fmtCurrency(detail.feePerSession)}/buổi
              </span>
              {detail.startDate && (
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Calendar size={14} /> {fmtDate(detail.startDate)}
                </span>
              )}
            </div>

            <div className="tabs">
              <button
                className={`tab ${detailTab === 'roster' ? 'active' : ''}`}
                onClick={() => setDetailTab('roster')}
              >
                Danh sách ({roster.length})
              </button>
              {isAdmin && (
                <button
                  className={`tab ${detailTab === 'teachers' ? 'active' : ''}`}
                  onClick={() => setDetailTab('teachers')}
                >
                  Giáo viên ({assignedTeachers.length})
                </button>
              )}
            </div>

            {rosterLoading ? (
              <div className="loading-state">
                <div className="spinner" />
                <span>Đang tải...</span>
              </div>
            ) : detailTab === 'roster' ? (
              <>
                {(isAdmin || user?.role === Role.TEACHER) && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <select
                      className="form-select"
                      style={{ flex: 1 }}
                      value={enrollStudentId}
                      onChange={(e) => setEnrollStudentId(e.target.value)}
                    >
                      <option value="">-- Chọn học sinh để thêm vào lớp --</option>
                      {unenrolled.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                          {s.studentClass ? ` (${s.studentClass})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={doEnroll}
                      disabled={enrolling}
                    >
                      {enrolling ? '...' : '+ Thêm'}
                    </button>
                  </div>
                )}
                {roster.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Users size={40} />
                    </div>
                    <h3>Chưa có học sinh</h3>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Học sinh</th>
                          <th>SĐT phụ huynh</th>
                          <th>Link phụ huynh</th>
                          {(isAdmin || user?.role === Role.TEACHER) && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <strong>{s.fullName}</strong>
                            </td>
                            <td>{s.parentPhone || '—'}</td>
                            <td>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  navigator.clipboard?.writeText(
                                    `${window.location.origin}/parent/${s.id}`
                                  );
                                  toast('Đã sao chép link phụ huynh');
                                }}
                              >
                                <Copy size={14} /> Copy link
                              </button>
                            </td>
                            {(isAdmin || user?.role === Role.TEACHER) && (
                              <td>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => doRemoveStudent(s.id)}
                                >
                                  Xóa
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <select
                    className="form-select"
                    style={{ flex: 1 }}
                    value={assignTeacherId}
                    onChange={(e) => setAssignTeacherId(e.target.value)}
                  >
                    <option value="">-- Chọn giáo viên / trợ giảng --</option>
                    {unassigned.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.role === Role.TEACHER ? 'GV' : 'TG'}) - {t.email}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={doAssignTeacher}
                    disabled={assigning}
                  >
                    {assigning ? '...' : '+ Phân công'}
                  </button>
                </div>
                {assignedTeachers.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <GraduationCap size={40} />
                    </div>
                    <h3>Chưa phân công giáo viên</h3>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Giáo viên</th>
                          <th>Vai trò</th>
                          <th>Email</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedTeachers.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <strong>{t.name}</strong>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  t.role === Role.TEACHER ? 'badge-teacher' : 'badge-warning'
                                }`}
                              >
                                {t.role === Role.TEACHER ? 'Giáo viên' : 'Trợ giảng'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.83rem' }}>{t.email}</td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => doRemoveTeacher(t.id)}
                              >
                                Hủy
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
