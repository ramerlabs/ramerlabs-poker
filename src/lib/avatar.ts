/** Max decoded image size for uploaded avatars (~150 KB). */
export const MAX_AVATAR_BYTES = 150_000;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function matchesMagicBytes(raw: Buffer, mime: string): boolean {
  if (raw.byteLength < 12) return false;
  if (mime === "image/jpeg") {
    return raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff;
  }
  if (mime === "image/png") {
    return (
      raw[0] === 0x89 &&
      raw[1] === 0x50 &&
      raw[2] === 0x4e &&
      raw[3] === 0x47 &&
      raw[4] === 0x0d &&
      raw[5] === 0x0a &&
      raw[6] === 0x1a &&
      raw[7] === 0x0a
    );
  }
  if (mime === "image/gif") {
    return raw[0] === 0x47 && raw[1] === 0x49 && raw[2] === 0x46;
  }
  if (mime === "image/webp") {
    return (
      raw.subarray(0, 4).toString("ascii") === "RIFF" &&
      raw.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

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
    if (!matchesMagicBytes(raw, mime)) {
      return { ok: false, error: "File content does not match the declared image type" };
    }
  } catch {
    return { ok: false, error: "Invalid image data" };
  }
  return { ok: true };
}
