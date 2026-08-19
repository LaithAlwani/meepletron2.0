/**
 * Downscale + re-encode an image to a JPEG in the browser, so we only ever
 * upload (and store) the compressed version — never the multi-MB original.
 * Shared by the avatar picker and the play-photo uploader (which pass a larger
 * `max` than the small avatar crop).
 */
export async function compressImage(
  file: File,
  max = 1600,
  quality = 0.8,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Compression failed");
  return blob;
}
