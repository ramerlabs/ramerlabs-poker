/** Max decoded image size for uploaded avatars (~150 KB). */
export const MAX_AVATAR_BYTES = 150_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateAvatarDataUrl(dataUrl: string): { ok: true } | { ok: false; error: string } {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return { ok: false, error: "Upload a JPEG, PNG, WebP, or GIF image" };
  }
  const mime = match[1]!.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "Unsupported image type" };
  }
  try {
    const raw = Buffer.from(match[2]!, "base64");
    if (raw.byteLength > MAX_AVATAR_BYTES) {
      return { ok: false, error: `Image too large (max ${Math.round(MAX_AVATAR_BYTES / 1024)} KB)` };
    }
    if (raw.byteLength < 64) {
      return { ok: false, error: "Image file is too small" };
    }
  } catch {
    return { ok: false, error: "Invalid image data" };
  }
  return { ok: true };
}
