import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import { FileText, Save, ClipboardList, Plus, Trash2, Search, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  addGradeColumn,
  calcGradeAverage10,
  deleteGradeColumnAndScores,
  getClassById,
  getClasses,
  getClassRoster,
  getGradeColumns,
  getGradeRows,
  getOrCreateClassGradebook,
  migrateLegacyScoresToGradebook,
  saveGradeRows,
  todayStr,
  updateGradeColumn,
} from '../services/dataService';
import {
  ClassItem,
  GradeColumn,
  GradeColumnType,
  GradeRow,
  Student,
} from '../types';
import ZaloSendDialog from '../components/ZaloSendDialog';
import { type ZaloRecipient } from '../services/zaloService';

type RowState = {
  studentId: string;
  fullName: string;
  studentClass: string;
  scores: Record<string, string>;
  average10: number | null;
};

const TYPE_SHORT: Record<GradeColumnType, string> = {
  REGULAR: 'TX',
  MIDTERM: 'GK',
  FINAL: 'CK',
  OTHER: 'Khác',
};

const TYPE_LABEL: Record<GradeColumnType, string> = {
  REGULAR: 'Thường xuyên',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
  OTHER: 'Khác',
};

const DEFAULT_WEIGHT: Record<GradeColumnType, number> = {
  REGULAR: 1,
  MIDTERM: 2,
  FINAL: 3,
  OTHER: 1,
};

function parseScore(value: string) {
  if (value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function toNumericScores(scores: Record<string, string>) {
  const out: Record<string, number> = {};
  Object.entries(scores).forEach(([columnId, raw]) => {
    const n = parseScore(raw);
    if (n !== null && Number.isFinite(n)) out[columnId] = n;
  });
  return out;
}

function scoreColor(score: number, max: number) {
  if (max <= 0) return 'var(--text-muted)';
  return score / max >= 0.5 ? 'var(--success)' : 'var(--danger)';
}

function nextColumnName(type: GradeColumnType, columns: GradeColumn[]) {
  if (type === 'MIDTERM') return columns.some((c) => c.name === 'GK') ? `GK ${columns.length + 1}` : 'GK';
  if (type === 'FINAL') return columns.some((c) => c.name === 'CK') ? `CK ${columns.length + 1}` : 'CK';

  const prefix = type === 'REGULAR' ? 'TX' : 'Cột';
  let i = 1;
  while (columns.some((c) => c.name.trim().toLowerCase() === `${prefix}${i}`.toLowerCase())) i += 1;
  return `${prefix}${i}`;
}

function buildRows(roster: Student[], storedRows: GradeRow[], columns: GradeColumn[]): RowState[] {
  const rowMap = new Map(storedRows.map((r) => [r.studentId, r]));

  return roster.map((student) => {
    const stored = rowMap.get(student.id);
    const scores: Record<string, string> = {};

    columns.forEach((column) => {
      const value = stored?.scores?.[column.id];
      if (value !== undefined && value !== null) scores[column.id] = String(value);
    });

    return {
      studentId: student.id,
      fullName: student.fullName,
      studentClass: student.studentClass || '',
      scores,
      average10: calcGradeAverage10(toNumericScores(scores), columns),
    };
  });
}

export default function Grades() {
  const { user } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [gradebookId, setGradebookId] = useState('');
  const [roster, setRoster] = useState<Student[]>([]);
  const [columns, setColumns] = useState<GradeColumn[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Record<string, true>>({});
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [columnSaving, setColumnSaving] = useState(false);
  const [showZaloDialog, setShowZaloDialog] = useState(false);
  const [zaloRecipients, setZaloRecipients] = useState<ZaloRecipient[]>([]);

  useEffect(() => {
    if (!user) return;
    getClasses(user).then(setClasses).catch((e) => toast(e.message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCls = classes.find((c) => c.id === selectedClass);
  const dirtyCount = Object.keys(dirtyIds).length;

  const loadClass = useCallback(
    async (classId: string) => {
      if (!user || !classId) return;
      setLoading(true);
      setDirtyIds({});

      try {
        const classInfo = classes.find((c) => c.id === classId) || (await getClassById(classId));
        if (!classInfo) throw new Error('Không tìm thấy lớp học');

        const [gradebook, rosterData] = await Promise.all([
          getOrCreateClassGradebook(classInfo, user.id),
          getClassRoster(classId),
        ]);

        let [cols, storedRows] = await Promise.all([
          getGradeColumns(gradebook.id),
          getGradeRows(gradebook.id),
        ]);

        const migrated = await migrateLegacyScoresToGradebook(
          classId,
          gradebook.id,
          rosterData,
          user.id
        );

        if (migrated) {
          [cols, storedRows] = await Promise.all([
            getGradeColumns(gradebook.id),
            getGradeRows(gradebook.id),
          ]);
          toast('Đã tự chuyển điểm cũ sang bảng điểm mới', 'success');
        }

        setSelectedClass(classId);
        setGradebookId(gradebook.id);
        setRoster(rosterData);
        setColumns(cols);
        setRows(buildRows(rosterData, storedRows, cols));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Lỗi tải bảng điểm', 'error');
      } finally {
        setLoading(false);
      }
    },
    [classes, toast, user]
  );

  function handleClassChange(e: ChangeEvent<HTMLSelectElement>) {
    const classId = e.target.value;

    if (dirtyCount > 0 && !window.confirm('Bạn có điểm chưa lưu. Chuyển lớp sẽ bỏ thay đổi này. Tiếp tục?')) {
      return;
    }

    setSelectedClass(classId);
    setQ('');

    if (classId) {
      loadClass(classId);
    } else {
      setGradebookId('');
      setRoster([]);
      setColumns([]);
      setRows([]);
      setDirtyIds({});
    }
  }

  async function addColumn(type: GradeColumnType) {
    if (!gradebookId || !selectedClass) {
      toast('Vui lòng chọn lớp trước', 'warning');
      return;
    }

    if (dirtyCount > 0) {
      toast('Vui lòng lưu điểm đang nhập trước khi thêm cột', 'warning');
      return;
    }

    setColumnSaving(true);
    try {
      await addGradeColumn(gradebookId, {
        name: nextColumnName(type, columns),
        type,
        maxScore: 10,
        weight: DEFAULT_WEIGHT[type],
        examDate: todayStr(),
        order: columns.length ? Math.max(...columns.map((c) => c.order)) + 1 : 1,
      });
      toast('Đã thêm cột điểm', 'success');
      await loadClass(selectedClass);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi thêm cột điểm', 'error');
    } finally {
      setColumnSaving(false);
    }
  }

  function patchColumn(columnId: string, patch: Partial<GradeColumn>) {
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id !== columnId) return col;
        const next = { ...col, ...patch };
        return {
          ...next,
          maxScore: Number(next.maxScore) || 10,
          weight: Number(next.weight) || 1,
        };
      })
    );
  }

  async function saveColumn(column: GradeColumn) {
    if (!gradebookId) return;
    const name = column.name.trim();
    if (!name) {
      toast('Tên cột không được để trống', 'warning');
      return;
    }
    if (!Number.isFinite(Number(column.maxScore)) || Number(column.maxScore) <= 0) {
      toast(`Điểm tối đa của ${name} không hợp lệ`, 'warning');
      return;
    }

    try {
      await updateGradeColumn(gradebookId, column.id, {
        name,
        type: column.type,
        maxScore: Number(column.maxScore) || 10,
        weight: Number(column.weight) || 1,
        order: column.order,
        examDate: column.examDate || todayStr(),
      });
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          average10: calcGradeAverage10(toNumericScores(row.scores), columns),
        }))
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu cột điểm', 'error');
    }
  }

  async function deleteColumn(column: GradeColumn) {
    if (!gradebookId || !selectedClass) return;
    if (!window.confirm(`Xóa cột "${column.name}"? Điểm trong cột này cũng sẽ bị xóa.`)) return;

    setColumnSaving(true);
    try {
      await deleteGradeColumnAndScores(gradebookId, column.id);
      toast('Đã xóa cột điểm', 'success');
      await loadClass(selectedClass);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi xóa cột điểm', 'error');
    } finally {
      setColumnSaving(false);
    }
  }

  function updateScore(studentId: string, columnId: string, raw: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.studentId !== studentId) return row;
        const nextScores = { ...row.scores, [columnId]: raw };
        return {
          ...row,
          scores: nextScores,
          average10: calcGradeAverage10(toNumericScores(nextScores), columns),
        };
      })
    );
    setDirtyIds((prev) => ({ ...prev, [studentId]: true }));
  }

  function handlePaste(
    e: ClipboardEvent<HTMLInputElement>,
    startStudentId: string,
    startColumnId: string
  ) {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;

    e.preventDefault();
    const grid = text.replace(/\r/g, '').split('\n').filter(Boolean).map((line) => line.split('\t'));
    const startRow = rows.findIndex((r) => r.studentId === startStudentId);
    const startCol = columns.findIndex((c) => c.id === startColumnId);
    if (startRow < 0 || startCol < 0) return;

    const changed: Record<string, true> = {};
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, scores: { ...r.scores } }));

      grid.forEach((line, rOffset) => {
        const row = next[startRow + rOffset];
        if (!row) return;

        line.forEach((cell, cOffset) => {
          const col = columns[startCol + cOffset];
          if (!col) return;
          row.scores[col.id] = cell.trim();
          changed[row.studentId] = true;
        });

        row.average10 = calcGradeAverage10(toNumericScores(row.scores), columns);
      });

      return next;
    });
    setDirtyIds((prev) => ({ ...prev, ...changed }));
  }

  function moveFocus(studentId: string, columnId: string, direction: 1 | -1) {
    const visibleIndex = visibleRows.findIndex((r) => r.studentId === studentId);
    const nextRow = visibleRows[visibleIndex + direction];
    if (!nextRow) return;
    document.getElementById(`score_${nextRow.studentId}_${columnId}`)?.focus();
  }

  async function saveChanges() {
    if (!gradebookId || !user) return;
    const dirtyRows = rows.filter((row) => dirtyIds[row.studentId]);
    if (dirtyRows.length === 0) {
      toast('Không có thay đổi cần lưu', 'warning');
      return;
    }

    const errors: string[] = [];
    const payload = dirtyRows.map((row) => {
      const cleanScores: Record<string, number> = {};

      columns.forEach((col) => {
        const raw = row.scores[col.id] ?? '';
        if (raw.trim() === '') return;

        const n = parseScore(raw);
        if (n === null || !Number.isFinite(n) || n < 0 || n > col.maxScore) {
          errors.push(`${row.fullName} - ${col.name}`);
          return;
        }
        cleanScores[col.id] = n;
      });

      return {
        studentId: row.studentId,
        fullName: row.fullName,
        studentClass: row.studentClass,
        scores: cleanScores,
      };
    });

    if (errors.length > 0) {
      toast(
        `Điểm không hợp lệ: ${errors.slice(0, 4).join(', ')}${errors.length > 4 ? '...' : ''}`,
        'warning'
      );
      return;
    }

    setSaving(true);
    try {
      await saveGradeRows(gradebookId, columns, payload, user.id);
      toast(`Đã lưu ${dirtyRows.length} dòng điểm`, 'success');
      setDirtyIds({});
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu điểm', 'error');
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(keyword) ||
        r.studentClass.toLowerCase().includes(keyword) ||
        r.studentId.toLowerCase().includes(keyword)
    );
  }, [q, rows]);

  const filledCount = useMemo(() => {
    return rows.reduce((sum, row) => {
      return sum + columns.filter((col) => (row.scores[col.id] ?? '').trim() !== '').length;
    }, 0);
  }, [columns, rows]);

  const totalCells = rows.length * columns.length;

  function openGradesZalo() {
    if (!selectedClass || !gradebookId || rows.length === 0) {
      toast('Vui lòng chọn lớp có bảng điểm trước', 'warning');
      return;
    }
    if (dirtyCount > 0) {
      toast('Vui lòng lưu điểm đang nhập trước khi gửi Zalo', 'warning');
      return;
    }

    const studentById = new Map(roster.map((student) => [student.id, student]));
    const recipients: ZaloRecipient[] = rows.map((row) => {
      const student = studentById.get(row.studentId);
      const scoreLines = columns
        .map((column) => {
          const raw = (row.scores[column.id] ?? '').trim();
          return raw ? `${column.name}: ${raw}/${column.maxScore}` : '';
        })
        .filter(Boolean);

      return {
        id: row.studentId,
        name: row.fullName,
        phone: student?.parentPhone || '',
        message: [
          `Kính gửi phụ huynh${student?.parentName ? ` ${student.parentName}` : ''},`,
          `Trung tâm gửi kết quả học tập của học sinh ${row.fullName} - lớp ${selectedCls?.className || ''}.`,
          scoreLines.length ? scoreLines.join('\n') : 'Hiện chưa có điểm được nhập.',
          row.average10 !== null ? `Trung bình quy đổi /10: ${row.average10}` : '',
          '',
          `Xem báo cáo: ${window.location.origin}/parent/${row.studentId}`,
          'Trân trọng.',
        ].filter(Boolean).join('\n'),
      };
    });

    setZaloRecipients(recipients);
    setShowZaloDialog(true);
  }

  return (
    <div className="fade-up gradebook-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FileText size={26} /> <span>Nhập điểm</span>
          </h1>
          <p className="page-sub">
            Nhập điểm trực tiếp theo bảng như Excel. Có thể sửa tên cột, dán điểm từ Excel và lưu các dòng đã thay đổi.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={openGradesZalo}
            disabled={!selectedClass || rows.length === 0 || dirtyCount > 0}
            type="button"
            title={dirtyCount > 0 ? 'Lưu điểm trước khi gửi Zalo' : 'Gửi bảng điểm cho phụ huynh qua Zalo'}
          >
            <MessageCircle size={16} /> Gửi Zalo bảng điểm
          </button>
          <button
            className="btn btn-primary"
            onClick={saveChanges}
            disabled={saving || dirtyCount === 0}
            type="button"
          >
            <Save size={16} /> {saving ? 'Đang lưu...' : `Lưu thay đổi${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      <div className="card gradebook-toolbar-card">
        <div className="card-body gradebook-toolbar">
          <div className="form-group gradebook-class-select">
            <label className="form-label">Lớp học</label>
            <select className="form-select" value={selectedClass} onChange={handleClassChange}>
              <option value="">-- Chọn lớp --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}{c.subject ? ` - ${c.subject}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group gradebook-search-box">
            <label className="form-label">Tìm học sinh</label>
            <div className="gradebook-search-input">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nhập tên, lớp hoặc mã học sinh..."
                disabled={!selectedClass}
              />
            </div>
          </div>

          <div className="gradebook-actions">
            <button className="btn btn-secondary" onClick={() => addColumn('REGULAR')} disabled={!selectedClass || columnSaving} type="button">
              <Plus size={15} /> TX
            </button>
            <button className="btn btn-secondary" onClick={() => addColumn('MIDTERM')} disabled={!selectedClass || columnSaving} type="button">
              <Plus size={15} /> GK
            </button>
            <button className="btn btn-secondary" onClick={() => addColumn('FINAL')} disabled={!selectedClass || columnSaving} type="button">
              <Plus size={15} /> CK
            </button>
          </div>
        </div>
      </div>

      {selectedClass && (
        <div className="gradebook-summary">
          <div className="gradebook-summary-item">
            <span>Lớp</span>
            <strong>{selectedCls?.className || '—'}</strong>
          </div>
          <div className="gradebook-summary-item">
            <span>Học sinh</span>
            <strong>{roster.length}</strong>
          </div>
          <div className="gradebook-summary-item">
            <span>Cột điểm</span>
            <strong>{columns.length}</strong>
          </div>
          <div className="gradebook-summary-item">
            <span>Đã nhập</span>
            <strong>{filledCount}/{totalCells}</strong>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải bảng điểm...</span>
        </div>
      )}

      {!loading && !selectedClass && (
        <div className="empty-state card" style={{ marginTop: '1.5rem' }}>
          <div className="empty-icon">
            <ClipboardList size={40} />
          </div>
          <h3>Chọn lớp để nhập điểm</h3>
          <p>Sau khi chọn lớp, hệ thống sẽ hiện toàn bộ học sinh và các cột điểm.</p>
        </div>
      )}

      {!loading && selectedClass && roster.length === 0 && (
        <div className="empty-state card" style={{ marginTop: '1.5rem' }}>
          <div className="empty-icon">
            <ClipboardList size={40} />
          </div>
          <h3>Lớp này chưa có học sinh</h3>
          <p>Vào mục Lớp học để thêm học sinh vào lớp trước.</p>
        </div>
      )}

      {!loading && selectedClass && roster.length > 0 && columns.length === 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="empty-state">
            <div className="empty-icon">
              <FileText size={40} />
            </div>
            <h3>Chưa có cột điểm</h3>
            <p>Nhấn “+ TX”, “+ GK” hoặc “+ CK” để tạo cột điểm đầu tiên.</p>
          </div>
        </div>
      )}

      {!loading && selectedClass && roster.length > 0 && columns.length > 0 && (
        <div className="card gradebook-card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header gradebook-card-header">
            <span>Bảng điểm — {selectedCls?.className}</span>
            <span>{visibleRows.length}/{rows.length} học sinh đang hiển thị</span>
          </div>

          <div className="gradebook-hint">
            Mẹo: có thể copy một vùng điểm từ Excel rồi dán vào ô đầu tiên. Nhấn Enter để xuống học sinh tiếp theo.
          </div>

          <div className="table-wrap gradebook-table-wrap">
            <table className="gradebook-table">
              <thead>
                <tr>
                  <th className="col-stt">#</th>
                  <th className="col-student sticky-student">Học sinh</th>
                  {columns.map((col) => (
                    <th key={col.id} className="grade-col-header">
                      <div className="grade-col-box">
                        <input
                          className="grade-col-name-input"
                          value={col.name}
                          onChange={(e) => patchColumn(col.id, { name: e.target.value })}
                          onBlur={() => saveColumn(col)}
                          title="Sửa tên cột điểm"
                        />
                        <div className="grade-col-sub">
                          <span className={`grade-type-badge type-${col.type.toLowerCase()}`}>{TYPE_SHORT[col.type]}</span>
                          <span title={TYPE_LABEL[col.type]}>/{col.maxScore}</span>
                          <span>HS {col.weight}</span>
                        </div>
                        <div className="grade-col-edit-line">
                          <label>
                            Max
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={col.maxScore}
                              onChange={(e) => patchColumn(col.id, { maxScore: Number(e.target.value) })}
                              onBlur={() => saveColumn(col)}
                            />
                          </label>
                          <label>
                            Hệ số
                            <input
                              type="number"
                              min="0.5"
                              max="10"
                              step="0.5"
                              value={col.weight}
                              onChange={(e) => patchColumn(col.id, { weight: Number(e.target.value) })}
                              onBlur={() => saveColumn(col)}
                            />
                          </label>
                        </div>
                        <button
                          className="grade-delete-col"
                          onClick={() => deleteColumn(col)}
                          title="Xóa cột điểm"
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="col-average">TB /10</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const realIndex = rows.findIndex((r) => r.studentId === row.studentId);
                  const isDirty = !!dirtyIds[row.studentId];

                  return (
                    <tr key={row.studentId} className={isDirty ? 'dirty-row' : undefined}>
                      <td className="col-stt">{realIndex + 1}</td>
                      <td className="col-student sticky-student">
                        <strong>{row.fullName}</strong>
                        <div className="student-subline">{row.studentClass || row.studentId.slice(0, 8)}</div>
                      </td>
                      {columns.map((col) => {
                        const parsed = parseScore(row.scores[col.id] ?? '');
                        const isInvalid =
                          parsed !== null &&
                          (!Number.isFinite(parsed) || parsed < 0 || parsed > col.maxScore);

                        return (
                          <td key={col.id} className="grade-score-cell">
                            <input
                              id={`score_${row.studentId}_${col.id}`}
                              className={`grade-score-input ${isInvalid ? 'invalid' : ''}`}
                              value={row.scores[col.id] ?? ''}
                              onChange={(e) => updateScore(row.studentId, col.id, e.target.value)}
                              onPaste={(e) => handlePaste(e, row.studentId, col.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  moveFocus(row.studentId, col.id, e.shiftKey ? -1 : 1);
                                }
                              }}
                              inputMode="decimal"
                              placeholder="—"
                              title={`Nhập điểm ${col.name} cho ${row.fullName}`}
                            />
                          </td>
                        );
                      })}
                      <td className="col-average">
                        {row.average10 !== null ? (
                          <span style={{ color: scoreColor(row.average10, 10), fontWeight: 800 }}>
                            {row.average10}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-light)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="gradebook-footer-save">
            <div>
              {dirtyCount > 0 ? (
                <span>Có {dirtyCount} dòng chưa lưu.</span>
              ) : (
                <span>Tất cả thay đổi đã được lưu.</span>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={saveChanges}
              disabled={saving || dirtyCount === 0}
              type="button"
            >
              <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      )}

      <ZaloSendDialog
        open={showZaloDialog}
        onClose={() => setShowZaloDialog(false)}
        title={`Gửi bảng điểm Zalo — ${selectedCls?.className || ''}`}
        recipients={zaloRecipients}
        allowAttachments={false}
        log={selectedClass && gradebookId ? { kind: 'GRADES', classId: selectedClass, periodKey: gradebookId } : undefined}
      />
    </div>
  );
}
