// src/services/zaloFiles.ts
// Chuẩn bị ảnh và file trước khi gửi qua Zalo.
//
// Vì sao cần nén ảnh: proxy Vercel giới hạn body request 4.5MB, base64 lại phình
// thêm ~33%. Ảnh chụp bằng điện thoại thường 4–8MB nên gửi thẳng là chắc chắn lỗi.
// Nén xuống cạnh dài 1600px, JPEG chất lượng 0.82 — vẫn đọc rõ bảng điểm viết tay,
// mà dung lượng thường về dưới 400KB.

export interface ZaloFileInput {
  filename: string;
  base64?: string;
  url?: string;
  /** Chỉ dùng để hiển thị trên giao diện, không gửi lên server. */
  previewUrl?: string;
  sizeBytes?: number;
}

/** Trần an toàn cho base64 đi qua proxy Vercel. */
export const MAX_DIRECT_BYTES = 2_600_000;
export const MAX_FILES = 5;

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif)$/i;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
    img.src = src;
  });
}

/** Đổi đuôi file sang .jpg sau khi nén, để backend nhận đúng loại. */
function toJpgName(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.jpg';
}

async function compressImage(file: File): Promise<{ base64: string; filename: string; size: number }> {
  const dataUrl = await readAsDataUrl(file);

  // GIF động sẽ mất animation nếu vẽ qua canvas — giữ nguyên bản gốc.
  if (/^image\/gif$/i.test(file.type)) {
    const base64 = dataUrl.split(',')[1] ?? '';
    return { base64, filename: file.name, size: Math.round(base64.length * 0.75) };
  }

  const img = await loadImage(dataUrl);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ nén ảnh');

  // Nền trắng để ảnh PNG trong suốt không thành đen khi chuyển sang JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let out = canvas.toDataURL('image/jpeg', quality);

  // Ảnh rất lớn hoặc rất chi tiết có thể vẫn vượt trần — hạ chất lượng dần.
  while (out.length * 0.75 > MAX_DIRECT_BYTES && quality > 0.4) {
    quality -= 0.12;
    out = canvas.toDataURL('image/jpeg', quality);
  }

  const base64 = out.split(',')[1] ?? '';
  return { base64, filename: toJpgName(file.name), size: Math.round(base64.length * 0.75) };
}

/**
 * Chuyển danh sách file người dùng chọn thành dạng gửi được.
 * Ảnh được nén; file khác (PDF, docx…) giữ nguyên và bị chặn nếu quá lớn.
 */
export async function prepareFiles(files: File[]): Promise<ZaloFileInput[]> {
  if (files.length > MAX_FILES) {
    throw new Error(`Mỗi tin nhắn gửi tối đa ${MAX_FILES} file.`);
  }

  const out: ZaloFileInput[] = [];

  for (const file of files) {
    if (!file.name.includes('.')) {
      throw new Error(`File "${file.name}" không có phần mở rộng.`);
    }

    if (IMAGE_TYPES.test(file.type)) {
      const { base64, filename, size } = await compressImage(file);

      if (size > MAX_DIRECT_BYTES) {
        throw new Error(
          `Ảnh "${file.name}" vẫn còn ${fmtSize(size)} sau khi nén. Hãy chụp lại nhỏ hơn hoặc cắt bớt.`,
        );
      }

      out.push({
        filename,
        base64,
        sizeBytes: size,
        previewUrl: `data:image/jpeg;base64,${base64}`,
      });
      continue;
    }

    // File không phải ảnh: không nén được, chỉ kiểm tra dung lượng.
    if (file.size > MAX_DIRECT_BYTES) {
      throw new Error(
        `File "${file.name}" nặng ${fmtSize(file.size)}, vượt trần ${fmtSize(MAX_DIRECT_BYTES)}. ` +
          'File lớn cần tải lên Drive trước rồi gửi bằng đường link.',
      );
    }

    const dataUrl = await readAsDataUrl(file);
    out.push({
      filename: file.name,
      base64: dataUrl.split(',')[1] ?? '',
      sizeBytes: file.size,
    });
  }

  return out;
}

/** Bỏ các field chỉ dùng cho giao diện trước khi gửi lên server. */
export function stripPreview(files: ZaloFileInput[]) {
  return files.map(({ filename, base64, url }) => ({ filename, base64, url }));
}
