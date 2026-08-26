import { useState, useEffect } from 'react';
import { UserCog, Check, X, Trash2, Crown, GraduationCap, HandHelping } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAllUsers,
  approveUser,
  setUserRole,
  setUserApproval,
  deleteUserProfile,
} from '../services/authService';
import { AppUser, Role, ROLE_LABEL } from '../types';

type Tab = 'pending' | 'all';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await getAllUsers());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (uid: string) => {
    try {
      await approveUser(uid);
      toast('Đã phê duyệt người dùng', 'success');
      setUsers((prev) =>
        prev.map((u) => (u.id === uid ? { ...u, isApproved: true } : u))
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  };

  const handleRevoke = async (uid: string) => {
    if (!window.confirm('Thu hồi quyền truy cập của người dùng này?')) return;
    try {
      await setUserApproval(uid, false);
      toast('Đã thu hồi quyền truy cập');
      setUsers((prev) =>
        prev.map((u) => (u.id === uid ? { ...u, isApproved: false } : u))
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  };

  const handleRole = async (uid: string, role: Role) => {
    try {
      await setUserRole(uid, role);
      toast('Đã cập nhật vai trò', 'success');
      setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, role } : u)));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  };

  const handleDelete = async (u: AppUser) => {
    if (!window.confirm(`Xóa tài khoản "${u.name}"?`)) return;
    try {
      await deleteUserProfile(u.id);
      toast('Đã xóa người dùng');
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  };

  const pending = users.filter((u) => !u.isApproved);
  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const roleBadge = (role: Role) => {
    const map: Record<Role, { cls: string; icon: React.ReactNode }> = {
      [Role.ADMIN]: { cls: 'badge-danger', icon: <Crown size={12} /> },
      [Role.TEACHER]: { cls: 'badge-teacher', icon: <GraduationCap size={12} /> },
      [Role.TA]: { cls: 'badge-warning', icon: <HandHelping size={12} /> },
    };
    const m = map[role];
    return (
      <span className={`badge ${m.cls}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        {m.icon} {ROLE_LABEL[role]}
      </span>
    );
  };

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <UserCog size={26} /> <span>Quản lý người dùng</span>
          </h1>
          <p className="page-sub">Phê duyệt và phân quyền tài khoản</p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Chờ duyệt {pending.length > 0 && `(${pending.length})`}
        </button>
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          Tất cả ({users.length})
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải...</span>
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                <div className="empty-icon">
                  <Check size={40} />
                </div>
                <h3>Không có yêu cầu chờ duyệt</h3>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending.map((u) => (
              <div key={u.id} className="card">
                <div
                  className="card-body"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      className="user-avatar"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      {u.avatar ? <img src={u.avatar} alt="" /> : u.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{u.name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {u.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      className="form-select"
                      style={{ width: 'auto' }}
                      value={u.role}
                      onChange={(e) => handleRole(u.id, e.target.value as Role)}
                    >
                      <option value={Role.TEACHER}>Giáo viên</option>
                      <option value={Role.TA}>Trợ giảng</option>
                      <option value={Role.ADMIN}>Quản trị viên</option>
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={() => handleApprove(u.id)}>
                      <Check size={14} /> Duyệt
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>
                      <X size={14} /> Từ chối
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="card">
          <div className="card-body" style={{ paddingBottom: 8 }}>
            <input
              className="form-control"
              style={{ maxWidth: 320 }}
              placeholder="Tìm theo tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'center' }}>Vai trò</th>
                  <th style={{ textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      Không có người dùng
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const isMe = u.id === me?.id;
                    return (
                      <tr key={u.id} style={isMe ? { background: 'var(--bg-light)' } : undefined}>
                        <td>
                          <strong>{u.name}</strong>
                          {isMe && (
                            <span style={{ color: 'var(--primary)', fontSize: '0.75rem', marginLeft: 6 }}>
                              (Bạn)
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{u.email}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isMe ? (
                            roleBadge(u.role)
                          ) : (
                            <select
                              className="form-select"
                              style={{ width: 'auto', margin: '0 auto' }}
                              value={u.role}
                              onChange={(e) => handleRole(u.id, e.target.value as Role)}
                            >
                              <option value={Role.TEACHER}>Giáo viên</option>
                              <option value={Role.TA}>Trợ giảng</option>
                              <option value={Role.ADMIN}>Quản trị viên</option>
                            </select>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${u.isApproved ? 'badge-success' : 'badge-warning'}`}>
                            {u.isApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {!isMe && (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              {u.isApproved ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleRevoke(u.id)}
                                >
                                  Thu hồi
                                </button>
                              ) : (
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleApprove(u.id)}
                                >
                                  Duyệt
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => handleDelete(u)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
