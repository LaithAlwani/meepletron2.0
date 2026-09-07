/** PUT a blob/file to an R2 signed upload URL (minted by a Convex mutation).
 *  Throws on a non-2xx response. */
export async function putToSignedUrl(url: string, file: Blob): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: file.type ? { "Content-Type": file.type } : undefined,
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
}
