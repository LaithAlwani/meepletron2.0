import { PDFDocument } from "pdf-lib";

/** Number of pages in a PDF. */
export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export type BatchPlan = { index: number; startPage: number; endPage: number };

// Target raw bytes per batch. Gemini inlines PDF data as base64 (+~33%) with a
// ~20MB request cap, so keep the raw slice well under that (10MB → ~13.3MB
// base64, leaving headroom for prompt + pdf-lib re-save overhead).
const TARGET_BATCH_BYTES = 10 * 1024 * 1024;

/**
 * How many pages to put in each batch, sized from the file's average bytes-per-
 * page so an image-heavy PDF automatically uses fewer (even 1) pages per slice
 * and stays under the inline cap. Capped at `max` so light PDFs keep the normal
 * batch size; floored at 1. (A single page larger than the cap still can't be
 * inlined — that needs the Files API; see docs/large-pdf-files-api.md.)
 */
export function pagesPerBatchFor(
  fileBytes: number,
  totalPages: number,
  max = 5,
): number {
  if (totalPages <= 0 || fileBytes <= 0) return max;
  const avgPerPage = fileBytes / totalPages;
  const fit = Math.floor(TARGET_BATCH_BYTES / avgPerPage);
  return Math.max(1, Math.min(max, fit));
}

/**
 * Plan page-range batches. Gemini caps inline PDFs at 20MB, so we send a few
 * pages at a time. `pagesPerBatch` keeps each slice well under the cap — use
 * `pagesPerBatchFor` to size it to the file so heavy PDFs don't overflow.
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
