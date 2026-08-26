/**
 * Firebase/Vercel proxy cho zalo-service trên Render.
 * Client chỉ gọi /api/zalo; API key của Render không bao giờ xuống trình duyệt.
 *
 * Vercel env:
 *   ZALO_BACKEND_URL
 *   ZALO_BACKEND_API_KEY
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const BACKEND_URL = String(process.env.ZALO_BACKEND_URL || '').replace(/\/+$/, '');
const BACKEND_API_KEY = String(process.env.ZALO_BACKEND_API_KEY || '');
const LOG_KINDS = ['TUITION', 'ATTENDANCE', 'GRADES', 'GENERAL'];
const MAX_BASE64_CHARS = 3_000_000;
const MAX_FILES = 5;
const ID = '[A-Za-z0-9_-]+';

function initFirebaseAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw httpError(500, 'Thiếu FIREBASE_SERVICE_ACCOUNT_JSON trên Vercel.');

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch {
    throw httpError(500, 'FIREBASE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ.');
  }

  initializeApp({ credential: cert(serviceAccount) });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendError(res, error, fallback) {
  const status = Number(error?.status) || 500;
  console.error('[api/zalo]', error);
  return res.status(status).json({ ok: false, error: error?.message || fallback });
}

async function requireStaff(req) {
  initFirebaseAdmin();
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, 'Thiếu phiên đăng nhập.');

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(match[1]);
  } catch {
    throw httpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }

  const uid = decoded.uid;
  const snap = await getFirestore().collection('users').doc(uid).get();
  if (!snap.exists) throw httpError(403, 'Tài khoản chưa được cấp quyền nhân sự.');

  const role = String(snap.data()?.role || '');
  if (!role) throw httpError(403, 'Tài khoản chưa có vai trò hợp lệ.');
  return { uid, role };
}

function safeDocId(value) {
  return encodeURIComponent(String(value || '')).replace(/%/g, '_');
}

function parseLogRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '');
  const classId = String(raw.classId || '').trim();
  const periodKey = String(raw.periodKey || '').trim();
  if (!LOG_KINDS.includes(kind) || !classId || !periodKey) return null;

  const students = Array.isArray(raw.students)
    ? raw.students
        .map((s) => ({
          id: String(s?.id || '').trim(),
          name: s?.name ? String(s.name) : null,
          phone: s?.phone ? String(s.phone) : null,
        }))
        .filter((s) => s.id)
    : [];
  return { kind, classId, periodKey, students };
}

function logCollection(ref) {
  const key = safeDocId(`${ref.kind}__${ref.classId}__${ref.periodKey}`);
  return getFirestore().collection('zaloSendLogs').doc(key).collection('students');
}

async function readSentLog(ref) {
  const snap = await logCollection(ref).get();
  const out = {};
  snap.forEach((doc) => {
    const row = doc.data();
    out[doc.id] = {
      at: row.sentAt?.toDate?.()?.toISOString?.() || row.sentAt || '',
      byUid: row.byUid || '',
      byRole: row.byRole || '',
      jobId: row.jobId || undefined,
      name: row.studentName || undefined,
      phone: row.phone || undefined,
    };
  });
  return out;
}

async function writeSentLog(ref, staff, jobId) {
  if (!ref.students.length) return;
  const db = getFirestore();
  const batch = db.batch();
  const col = logCollection(ref);

  ref.students.forEach((student) => {
    batch.set(
      col.doc(safeDocId(student.id)),
      {
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        jobId: jobId || null,
        sentAt: FieldValue.serverTimestamp(),
        byUid: staff.uid,
        byRole: staff.role,
      },
      { merge: true }
    );
  });
  await batch.commit();
}

const ROUTES = [
  { test: /^health$/, method: 'GET' },
  { test: /^threads$/, method: 'GET' },
  { test: new RegExp(`^messages/${ID}$`), method: 'GET' },
  { test: /^updates$/, method: 'GET' },
  { test: new RegExp(`^job/${ID}$`), method: 'GET' },
  { test: /^send$/, method: 'POST' },
  { test: /^send-bulk$/, method: 'POST' },
  { test: /^send-file$/, method: 'POST' },
  { test: /^resolve$/, method: 'POST' },
  { test: new RegExp(`^read/${ID}$`), method: 'POST' },
  { test: new RegExp(`^threads/${ID}/name$`), method: 'POST' },
  { test: /^login\/state$/, method: 'GET', adminOnly: true },
  { test: /^login\/start$/, method: 'POST', adminOnly: true },
  { test: /^login\/retry$/, method: 'POST', adminOnly: true },
];

function resolveUpstream(pathValue) {
  const path = String(pathValue || '').replace(/^\/+/, '').trim();
  if (!path) throw httpError(400, 'Thiếu đường dẫn Zalo.');
  const route = ROUTES.find((r) => r.test.test(path));
  if (!route) throw httpError(400, `Đường dẫn Zalo không hợp lệ: ${path}`);
  return { path, method: route.method, adminOnly: route.adminOnly };
}

function validateFiles(files, where) {
  if (!Array.isArray(files) || files.length === 0) {
    throw httpError(400, `${where}: danh sách files rỗng.`);
  }
  if (files.length > MAX_FILES) throw httpError(400, `${where}: tối đa ${MAX_FILES} file mỗi tin.`);

  files.forEach((raw, index) => {
    const file = raw ?? {};
    if (!file.base64 && !file.url) {
      throw httpError(400, `${where}, file ${index + 1}: cần base64 hoặc url.`);
    }
    if (!file.url && !String(file.filename || '').includes('.')) {
      throw httpError(400, `${where}, file ${index + 1}: filename phải có phần mở rộng.`);
    }
    if (typeof file.base64 === 'string' && file.base64.length > MAX_BASE64_CHARS) {
      throw httpError(400, `${where}, file ${index + 1} quá lớn để gửi trực tiếp.`);
    }
  });
}

function validatePayload(path, payload) {
  const body = payload ?? {};
  if (path === 'send') {
    if (!String(body.message || '').trim() || (!body.phone && !body.userId)) {
      throw httpError(400, 'Tin nhắn cần có nội dung và số điện thoại hoặc userId.');
    }
    return;
  }

  if (path === 'send-bulk') {
    const items = body.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      throw httpError(400, 'Danh sách gửi phải có từ 1 đến 200 người.');
    }

    let totalBase64 = 0;
    items.forEach((raw, index) => {
      const item = raw ?? {};
      const where = `Dòng thứ ${index + 1}`;
      if (!item.phone && !item.userId) throw httpError(400, `${where} thiếu số điện thoại.`);
      const hasFiles = Array.isArray(item.files) && item.files.length > 0;
      if (!String(item.message || '').trim() && !hasFiles) {
        throw httpError(400, `${where} thiếu nội dung và cũng không có file.`);
      }
      if (hasFiles) {
        validateFiles(item.files, where);
        for (const f of item.files) {
          if (typeof f?.base64 === 'string') totalBase64 += f.base64.length;
        }
      }
    });
    if (totalBase64 > MAX_BASE64_CHARS) {
      throw httpError(400, 'Tổng dung lượng file của cả lô vượt giới hạn. Hãy gửi ít người hơn mỗi lượt.');
    }
    return;
  }

  if (path === 'send-file') {
    if (!body.phone && !body.userId) throw httpError(400, 'Cần số điện thoại hoặc userId.');
    validateFiles(body.files, 'Tin nhắn');
    return;
  }

  if (path === 'resolve' && !String(body.phone || '').trim()) {
    throw httpError(400, 'Thiếu số điện thoại.');
  }
}

const ALLOWED_QUERY = new Set(['since']);
function buildUrl(path, query) {
  const url = new URL(`${BACKEND_URL}/${path}`);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (ALLOWED_QUERY.has(key) && value != null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Chỉ hỗ trợ POST.' });
  }

  try {
    const staff = await requireStaff(req);
    const path = String(req.body?.path || '');

    if (path === 'sent-log') {
      const ref = parseLogRef(req.body?.payload);
      if (!ref) return res.status(400).json({ ok: false, error: 'Cần kind, classId và periodKey hợp lệ.' });
      const students = await readSentLog(ref);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, students });
    }

    if (!BACKEND_URL || !BACKEND_API_KEY) {
      const missing = [!BACKEND_URL && 'ZALO_BACKEND_URL', !BACKEND_API_KEY && 'ZALO_BACKEND_API_KEY']
        .filter(Boolean)
        .join(', ');
      return res.status(500).json({ ok: false, error: `Thiếu ${missing} trên Vercel.` });
    }

    const upstream = resolveUpstream(path);
    if (upstream.adminOnly && String(staff.role).toUpperCase() !== 'ADMIN') {
      return res.status(403).json({ ok: false, error: 'Chỉ quản trị viên được kết nối lại tài khoản Zalo.' });
    }

    const payload = req.body?.payload;
    if (upstream.method === 'POST') validatePayload(upstream.path, payload);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const upstreamResponse = await fetch(buildUrl(upstream.path, req.body?.query), {
        method: upstream.method,
        headers: {
          'x-api-key': BACKEND_API_KEY,
          'Content-Type': 'application/json',
        },
        ...(upstream.method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
        signal: controller.signal,
      });

      const text = await upstreamResponse.text();
      if (['send', 'send-bulk', 'send-file'].includes(upstream.path) && upstreamResponse.ok) {
        const ref = parseLogRef(req.body?.log);
        if (ref) {
          let jobId = '';
          try {
            jobId = String(JSON.parse(text)?.jobId || '');
          } catch {
            // Backend không trả JSON hợp lệ: vẫn không làm hỏng lệnh gửi đã thành công.
          }
          try {
            await writeSentLog(ref, staff, jobId);
          } catch (logError) {
            console.error('[api/zalo] Không ghi được nhật ký:', logError);
          }
        }
      }

      res.status(upstreamResponse.status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ ok: false, error: 'Dịch vụ Zalo phản hồi quá chậm.' });
    }
    return sendError(res, error, 'Không gọi được dịch vụ Zalo.');
  }
}
