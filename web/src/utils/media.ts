const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

export function getMediaUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return '';
  if (/^data:/i.test(pathOrUrl)) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const apiBase = String(import.meta.env.VITE_API_BASE_URL ?? '');
  const mediaBase = apiBase.replace(/\/api\/v1\/?$/, '');
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${mediaBase}${normalizedPath}`;
}

export function isImageSource(pathOrUrl: string | null | undefined, mimeType?: string | null) {
  if (!pathOrUrl) return false;
  if (mimeType?.startsWith('image/')) return true;
  if (/^data:image\//i.test(pathOrUrl)) return true;

  const cleanValue = pathOrUrl.split('?')[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => cleanValue.endsWith(extension));
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
