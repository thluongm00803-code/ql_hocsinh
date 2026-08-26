// ====== ROLES ======
export enum Role {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  TA = 'TA',
}

export const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: 'Quản trị viên',
  [Role.TEACHER]: 'Giáo viên',
  [Role.TA]: 'Trợ giảng',
};

// ====== USER ======
export interface AppUser {
  id: string; // Firebase UID
  name: string;
  email?: string;
  avatar?: string;
  role: Role;
  isApproved: boolean;
  createdAt?: Date;
}

// ====== CLASS ======
export type Status = 'ACTIVE' | 'INACTIVE';

export interface ClassItem {
  id: string;
  className: string;
  subject: string;
  grade: string;
  feePerSession: number;
  startDate: string; // YYYY-MM-DD
  status: Status;
  createdAt?: Date;
}

// ====== STUDENT ======
export interface Student {
  id: string;
  fullName: string;
  studentClass: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  note: string;
  status: Status;
  createdAt?: Date;
}

// ====== ENROLLMENT (student <-> class) ======
export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
}

// ====== CLASS TEACHER (user <-> class) ======
export interface ClassTeacher {
  id: string;
  teacherId: string;
  classId: string;
}

// ====== ATTENDANCE ======
export interface AttendanceRecord {
  id: string;
  classId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  present: boolean;
  note: string;
}

// ====== SCORE - LEGACY ======
// Giữ lại để trang phụ huynh / dữ liệu cũ vẫn hoạt động.
export interface ScoreRecord {
  id: string;
  classId: string;
  studentId: string;
  examName: string;
  score: number;
  maxScore: number;
  date: string;
  note: string;
}

// ====== GRADEBOOK - NEW EXCEL-LIKE SCORE ENTRY ======
export type GradeColumnType = 'REGULAR' | 'MIDTERM' | 'FINAL' | 'OTHER';

export const GRADE_COLUMN_TYPE_LABEL: Record<GradeColumnType, string> = {
  REGULAR: 'Thường xuyên',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
  OTHER: 'Khác',
};

export interface Gradebook {
  id: string;
  classId: string;
  className: string;
  subject: string;
  grade: string;
  semester: string;
  schoolYear: string;
  createdBy?: string;
  legacyMigrated?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GradeColumn {
  id: string;
  name: string;
  type: GradeColumnType;
  maxScore: number;
  weight: number;
  order: number;
  examDate: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GradeRow {
  id: string; // = studentId
  studentId: string;
  fullName: string;
  studentClass: string;
  scores: Record<string, number>; // { [columnId]: score }
  average10: number | null;
  updatedAt?: Date;
  updatedBy?: string;
}


// ====== PAYMENT / VIETQR ======
export type PaymentMode = 'GLOBAL' | 'CLASS';
export type TuitionPaymentStatus = 'UNPAID' | 'PAID';

export interface PaymentConfig {
  bankId: string;
  bankAccount: string;
  bankAccountName: string;
  centerName: string;
  qrTemplate: string;
  notePattern: string;
}

export interface ClassPaymentConfig {
  classId: string;
  mode: PaymentMode; // GLOBAL = dùng tài khoản chung; CLASS = dùng tài khoản riêng của lớp
  bankId: string;
  bankAccount: string;
  bankAccountName: string;
  qrTemplate: string;
  notePattern: string;
  isEnabled: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

export interface TuitionPaymentRecord {
  id: string;
  classId: string;
  studentId: string;
  monthKey: string; // YYYY-MM
  amount: number;
  transferNote: string;
  status: TuitionPaymentStatus;
  confirmedAt?: Date;
  confirmedBy?: string;
  confirmedByName?: string;
  note?: string;
  updatedAt?: Date;
}

// ====== DASHBOARD ======
export interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  totalTAs: number;
  presentToday: number;
  totalAttToday: number;
}

// ====== TUITION ======
export interface TuitionStudentRow {
  studentId: string;
  fullName: string;
  sessionsTotal: number;
  sessionsAttended: number;
  sessionsAbsent: number;
  feePerSession: number;
  tuition: number;
  paymentStatus?: TuitionPaymentStatus;
  paidAt?: Date;
  transferNote?: string;
}

export interface TuitionData {
  classInfo: ClassItem;
  students: TuitionStudentRow[];
}

// ====== PARENT REPORT ======
export interface ParentClassReport {
  classId: string;
  className: string;
  subject: string;
  grade: string;
  feePerSession: number;
  sessionsTotal: number;
  sessionsAttended: number;
  tuition: number;
  scores: ScoreRecord[];
  attendance: AttendanceRecord[];
  average10?: number | null;
}

export interface ParentReport {
  student: Student;
  classes: ParentClassReport[];
}
