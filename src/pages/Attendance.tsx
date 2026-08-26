import { useState, useEffect } from 'react';
import { CheckSquare, ClipboardList, Save, Check, X, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getClasses,
  getClassRoster,
  getAttendance,
  markAttendance,
  fmtDate,
  todayStr,
} from '../services/dataService';
import { ClassItem, Student } from '../types';
import ZaloSendDialog from '../components/ZaloSendDialog';
import { type ZaloRecipient } from '../services/zaloService';

interface RecordState {
  present: boolean;
  note: string;
}

export default function Attendance() {
  const { user } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(todayStr());
  const [roster, setRoster] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, RecordState>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [showZaloDialog, setShowZaloDialog] = useState(false);
  const [zaloRecipients, setZaloRecipients] = useState<ZaloRecipient[]>([]);

  useEffect(() => {
    if (!user) return;
    getClasses(user)
      .then((d) => {
        setClasses(d);
        if (d.length === 1) setSelectedClass(d[0].id);
      })
      .catch((e) => toast(e.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedClass && date) loadRosterAndAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, date]);

  async function loadRosterAndAttendance() {
    setLoading(true);
    setRosterLoaded(false);
    try {
      const [studentList, att] = await Promise.all([
        getClassRoster(selectedClass),
        getAttendance(selectedClass, date),
      ]);
      setRoster(studentList);
      const map: Record<string, RecordState> = {};
      studentList.forEach((s) => {
        const existing = att.find((a) => a.studentId === s.id);
        map[s.id] = {
          present: existing ? existing.present : true,
          note: existing?.note || '',
        };
      });
      setRecords(map);
      setRosterLoaded(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(val: boolean) {
    setRecords((prev) => {
      const next = { ...prev };
      roster.forEach((s) => {
        next[s.id] = { ...next[s.id], present: val };
      });
      return next;
    });
  }

  async function save() {
    if (!selectedClass) {
      toast('Chọn lớp trước', 'warning');
      return;
    }
    setSaving(true);
    try {
      const arr = roster.map((s) => ({
        studentId: s.id,
        present: records[s.id]?.present ?? true,
        note: records[s.id]?.note || '',
      }));
      await markAttendance(selectedClass, date, arr);
      toast(
        `Đã lưu điểm danh ${arr.filter((r) => r.present).length}/${roster.length} học sinh`
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  }

  const presentCount = roster.filter((s) => records[s.id]?.present).length;
  const cls = classes.find((c) => c.id === selectedClass);
  const absentStudents = roster.filter((s) => !(records[s.id]?.present ?? true));

  function openAbsentZalo() {
    if (!selectedClass || absentStudents.length === 0) {
      toast('Hiện không có học sinh vắng để gửi thông báo', 'warning');
      return;
    }

    const recipients: ZaloRecipient[] = absentStudents.map((student) => ({
      id: student.id,
      name: student.fullName,
      phone: student.parentPhone,
      message: [
        `Kính gửi phụ huynh${student.parentName ? ` ${student.parentName}` : ''},`,
        `Trung tâm thông báo: học sinh ${student.fullName} vắng buổi học ${cls?.className || ''} ngày ${fmtDate(date)}.`,
        records[student.id]?.note ? `Ghi chú: ${records[student.id].note}` : '',
        '',
        'Trân trọng.',
      ].filter(Boolean).join('\n'),
    }));

    setZaloRecipients(recipients);
    setShowZaloDialog(true);
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CheckSquare size={26} /> <span>Điểm danh</span>
          </h1>
          <p className="page-sub">Chọn lớp và ngày để điểm danh</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
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
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ngày điểm danh</label>
              <input
                className="form-control"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải danh sách...</span>
        </div>
      )}

      {rosterLoaded && !loading && (
        <div className="card">
          <div
            className="card-header"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>
              {cls?.className} — {fmtDate(date)}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              {presentCount}/{roster.length} có mặt
            </span>
          </div>
          <div className="card-body">
            {roster.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <ClipboardList size={40} />
                </div>
                <h3>Lớp này chưa có học sinh</h3>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleAll(true)}>
                    <Check size={14} /> Tất cả có mặt
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(false)}>
                    <X size={14} /> Tất cả vắng
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={openAbsentZalo}
                    disabled={absentStudents.length === 0}
                    title="Gửi thông báo Zalo cho phụ huynh học sinh vắng"
                  >
                    <MessageCircle size={14} /> Gửi Zalo HS vắng ({absentStudents.length})
                  </button>
                </div>
                <div className="att-list">
                  <div className="att-row header">
                    <div>Học sinh</div>
                    <div style={{ textAlign: 'center' }}>Có mặt</div>
                    <div>Ghi chú</div>
                  </div>
                  {roster.map((s) => (
                    <div
                      key={s.id}
                      className="att-row"
                      style={{
                        background: records[s.id]?.present
                          ? 'rgba(22,163,74,0.05)'
                          : 'rgba(220,38,38,0.05)',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.875rem' }}>{s.fullName}</strong>
                      </div>
                      <div className="att-check">
                        <input
                          type="checkbox"
                          style={{
                            width: 18,
                            height: 18,
                            accentColor: 'var(--primary)',
                            cursor: 'pointer',
                          }}
                          checked={records[s.id]?.present ?? true}
                          onChange={(e) =>
                            setRecords((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], present: e.target.checked },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <input
                          className="form-control"
                          style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                          placeholder="Ghi chú..."
                          value={records[s.id]?.note || ''}
                          onChange={(e) =>
                            setRecords((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], note: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>
                    <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu điểm danh'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!selectedClass && (
        <div className="empty-state" style={{ paddingTop: 30 }}>
          <div className="empty-icon">
            <CheckSquare size={40} />
          </div>
          <h3>Chọn lớp để bắt đầu điểm danh</h3>
        </div>
      )}

      <ZaloSendDialog
        open={showZaloDialog}
        onClose={() => setShowZaloDialog(false)}
        title={`Thông báo điểm danh — ${cls?.className || ''}`}
        recipients={zaloRecipients}
        allowAttachments={false}
        log={selectedClass ? { kind: 'ATTENDANCE', classId: selectedClass, periodKey: date } : undefined}
      />
    </div>
  );
}
