import { getAuth } from 'firebase/auth';

/** Lấy Firebase ID token của phiên hiện tại để api/zalo xác thực người gọi. */
async function requireAccessToken(): Promise<string> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Phiên đăng nhập đã hết hạn.');
  return user.getIdToken();
}

export interface ZaloFilePayload {
  filename: string;
  base64?: string;
  url?: string;
}

export interface ZaloRecipient {
  id: string;
  name: string;
  phone: string;
  message: string;
  files?: ZaloFilePayload[];
}

export type ZaloLogKind = 'TUITION' | 'ATTENDANCE' | 'GRADES' | 'GENERAL';

export interface ZaloLogRef {
  kind: ZaloLogKind;
  classId: string;
  periodKey: string;
}

export interface ZaloSentEntry {
  at: string;
  byUid: string;
  byRole: string;
  jobId?: string;
  name?: string;
  phone?: string;
}

export type ZaloSentMap = Record<string, ZaloSentEntry>;

export interface ZaloJob {
  jobId: string;
  total: number;
  sent: number;
  failed: number;
  status: 'running' | 'done';
  results?: Array<{
    to: string;
    ok: boolean;
    threadId?: string;
    error?: string;
  }>;
}

interface ZaloResponse {
  ok: boolean;
  error?: string;
  jobId?: string;
  students?: ZaloSentMap;
  total?: number;
  sent?: number;
  failed?: number;
  status?: 'running' | 'done';
  results?: ZaloJob['results'];
  zalo?: string;
  ownId?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
  quotaLeft?: number;
  queueDepth?: number;
  phase?: ZaloLoginPhase;
  qrImage?: string | null;
  name?: string | null;
  sessionB64?: string | null;
}

export function normalizeZaloPhone(value: string) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('84') && phone.length >= 11) phone = `0${phone.slice(2)}`;
  return phone;
}

export function isUsableZaloPhone(value: string) {
  const phone = normalizeZaloPhone(value);
  return /^0\d{8,10}$/.test(phone);
}

function cleanFiles(files?: ZaloFilePayload[]): ZaloFilePayload[] | undefined {
  if (!files?.length) return undefined;
  return files.map(({ filename, base64, url }) => ({ filename, base64, url }));
}

async function callZalo(
  path: string,
  payload?: unknown,
  log?: ZaloLogRef & { students?: Array<{ id: string; name?: string; phone?: string }> }
): Promise<ZaloResponse> {
  const token = await requireAccessToken();
  const response = await fetch('/api/zalo', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, payload, ...(log ? { log } : {}) }),
  });

  const data = (await response.json().catch(() => ({}))) as ZaloResponse;
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Không gọi được dịch vụ Zalo (${response.status}).`);
  }
  return data;
}

function withStudents(log: ZaloLogRef | undefined, recipients: ZaloRecipient[]) {
  if (!log) return undefined;
  return {
    ...log,
    students: recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      phone: normalizeZaloPhone(recipient.phone),
    })),
  };
}

export async function fetchZaloSentLog(log: ZaloLogRef): Promise<ZaloSentMap> {
  const data = await callZalo('sent-log', log);
  return data.students || {};
}

export async function sendZaloMessage(recipient: ZaloRecipient, log?: ZaloLogRef) {
  const data = await callZalo(
    'send',
    {
      phone: normalizeZaloPhone(recipient.phone),
      message: recipient.message.trim(),
      name: recipient.name,
    },
    withStudents(log, [recipient])
  );
  if (!data.jobId) throw new Error('Dịch vụ Zalo không trả về mã gửi.');
  return data.jobId;
}

export async function sendZaloFiles(recipient: ZaloRecipient, log?: ZaloLogRef) {
  const files = cleanFiles(recipient.files);
  if (!files) throw new Error('Không có file để gửi.');

  const data = await callZalo(
    'send-file',
    {
      phone: normalizeZaloPhone(recipient.phone),
      message: (recipient.message || '').trim(),
      name: recipient.name,
      files,
    },
    withStudents(log, [recipient])
  );

  if (!data.jobId) throw new Error('Dịch vụ Zalo không trả về mã gửi.');
  return data.jobId;
}

export async function sendZaloBulk(recipients: ZaloRecipient[], log?: ZaloLogRef) {
  if (recipients.length > 200) throw new Error('Mỗi lượt gửi tối đa 200 người.');

  const data = await callZalo(
    'send-bulk',
    {
      items: recipients.map((recipient) => {
        const files = cleanFiles(recipient.files);
        return {
          phone: normalizeZaloPhone(recipient.phone),
          message: (recipient.message || '').trim(),
          name: recipient.name,
          ...(files ? { files } : {}),
        };
      }),
    },
    withStudents(log, recipients)
  );

  if (!data.jobId) throw new Error('Dịch vụ Zalo không trả về mã gửi.');
  return data.jobId;
}

export interface ZaloHealth {
  ok: boolean;
  zalo: string;
  ownId?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
  quotaLeft?: number;
  queueDepth?: number;
}

export type ZaloLoginPhase =
  | 'idle'
  | 'waiting_scan'
  | 'scanned'
  | 'done'
  | 'expired'
  | 'declined'
  | 'error';

export interface ZaloLoginState {
  phase: ZaloLoginPhase;
  qrImage?: string | null;
  name?: string | null;
  error?: string | null;
  sessionB64?: string | null;
}

export async function getZaloHealth(): Promise<ZaloHealth> {
  const token = await requireAccessToken();
  const response = await fetch('/api/zalo', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: 'health' }),
  });

  const data = (await response.json().catch(() => ({}))) as ZaloResponse;
  if (response.status === 401 || response.status === 403) {
    throw new Error(data.error || 'Không có quyền xem tình trạng Zalo.');
  }

  return {
    ok: Boolean(data.ok),
    zalo: String(data.zalo || 'unknown'),
    ownId: data.ownId ?? null,
    connectedAt: data.connectedAt ?? null,
    lastError: data.lastError ?? data.error ?? null,
    quotaLeft: data.quotaLeft,
    queueDepth: data.queueDepth,
  };
}

export async function startZaloLogin() {
  await callZalo('login/start');
}

export async function getZaloLoginState(): Promise<ZaloLoginState> {
  const data = await callZalo('login/state');
  return {
    phase: data.phase || 'idle',
    qrImage: data.qrImage ?? null,
    name: data.name ?? null,
    error: data.error ?? null,
    sessionB64: data.sessionB64 ?? null,
  };
}

export async function retryZaloQr() {
  await callZalo('login/retry');
}

export async function getZaloJob(jobId: string): Promise<ZaloJob> {
  const data = await callZalo(`job/${encodeURIComponent(jobId)}`);
  return {
    jobId,
    total: Number(data.total) || 0,
    sent: Number(data.sent) || 0,
    failed: Number(data.failed) || 0,
    status: data.status === 'done' ? 'done' : 'running',
    results: data.results || [],
  };
}

export async function waitForZaloJob(
  jobId: string,
  onProgress?: (job: ZaloJob) => void,
  maxWaitMs?: number
) {
  const limit = maxWaitMs ?? 6 * 60_000;
  const startedAt = Date.now();
  let latest: ZaloJob | null = null;

  while (Date.now() - startedAt < limit) {
    latest = await getZaloJob(jobId);
    onProgress?.(latest);
    if (latest.status === 'done') return latest;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  return latest;
}
