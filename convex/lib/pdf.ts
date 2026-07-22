import { PDFDocument } from "pdf-lib";

/** Number of pages in a PDF. */
export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export type BatchPlan = { index: number; startPage: number; endPage: number };

/**
 * Plan page-range batches. Gemini caps inline PDFs at 20MB, so we send a few
 * pages at a time. `pagesPerBatch` keeps each slice well under the cap.
 */
export function planBatches(totalPages: number, pagesPerBatch = 5): BatchPlan[] {
  const batches: BatchPlan[] = [];
  for (let start = 1; start <= totalPages; start += pagesPerBatch) {
    const end = Math.min(start + pagesPerBatch - 1, totalPages);
    batches.push({ index: batches.length, startPage: start, endPage: end });
  }
  return batches;
}

/** Extract pages [startPage, endPage] (1-based, inclusive) into a new PDF. */
export async function extractPageRange(
  bytes: Uint8Array,
  startPage: number,
  endPage: number,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let p = startPage; p <= endPage; p++) indices.push(p - 1);
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return await out.save();
}
