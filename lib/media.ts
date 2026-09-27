export const mediaExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

const mimeAliases: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/jfif": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

const extensionMimes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  aac: "audio/aac",
};

export function resolveMediaMime(declaredType: string, fileName = "") {
  const declared = declaredType.split(";", 1)[0].trim().toLowerCase();
  const aliased = mimeAliases[declared] || declared;
  if (mediaExtensions[aliased]) return aliased;

  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (!declared || declared === "application/octet-stream")
    return extensionMimes[extension] || declared;

  return aliased;
}
