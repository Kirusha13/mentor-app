export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_LINK_LABEL_LENGTH = 80;
export const MAX_URL_LENGTH = 2048;
export const MAX_ATTACHMENTS_COUNT = 5;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENTS_BYTES = 25 * 1024 * 1024;
export const MAX_RATE = 100_000;

const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx'];

export function isAllowedAttachmentFile(file: File) {
  if (ALLOWED_FILE_TYPES.includes(file.type)) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function isReasonableTelegramId(value: string) {
  return /^\d{5,20}$/.test(value);
}

export function isReasonablePhone(value: string) {
  return /^[+\d\s\-()]{7,25}$/.test(value);
}
