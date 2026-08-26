import { useState, useEffect } from 'react';
import {
  Users,
  School,
  GraduationCap,
  HandHelping,
  CheckSquare,
  ClipboardList,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDashboard } from '../services/dataService';
import { DashboardStats } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>Đang tải...</span>
      </div>
    );

  const cards = [
    { icon: <Users size={26} />, label: 'Học sinh', value: stats?.totalStudents ?? 0 },
    { icon: <School size={26} />, label: 'Lớp học', value: stats?.totalClasses ?? 0 },
    { icon: <GraduationCap size={26} />, label: 'Giáo viên', value: stats?.totalTeachers ?? 0 },
    { icon: <HandHelping size={26} />, label: 'Trợ giảng', value: stats?.totalTAs ?? 0 },
    { icon: <CheckSquare size={26} />, label: 'Có mặt hôm nay', value: stats?.presentToday ?? 0 },
    { icon: <ClipboardList size={26} />, label: 'Buổi hôm nay', value: stats?.totalAttToday ?? 0 },
  ];

  const absent = (stats?.totalAttToday ?? 0) - (stats?.presentToday ?? 0);
  const pct = stats?.totalAttToday
    ? Math.round((stats.presentToday / stats.totalAttToday) * 100)
    : 0;

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BarChart3 size={26} /> <span>Dashboard</span>
          </h1>
          <p className="page-sub">
            Xin chào, <strong>{user?.name}</strong>! Đây là tổng quan hôm nay.
          </p>
        </div>
      </div>

      <div className="stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-icon">{c.icon}</span>
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">Thống kê điểm danh hôm nay</div>
        <div className="card-body">
          {stats?.totalAttToday === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <ClipboardList size={40} />
              </div>
              <h3>Chưa có dữ liệu điểm danh hôm nay</h3>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <MiniStat value={stats?.presentToday ?? 0} label="Có mặt" color="var(--success)" />
              <MiniStat value={absent} label="Vắng mặt" color="var(--danger)" />
              <MiniStat value={`${pct}%`} label="Tỉ lệ có mặt" color="var(--primary)" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 180,
        background: 'var(--bg-light)',
        borderRadius: 'var(--radius-sm)',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '2.1rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}
