# Large-PDF ingestion via the Gemini Files API (design — for review)

Status: **not implemented.** Phase 1 (adaptive batch sizing) is live; this is the
durable fix for the remaining case.

## Problem

Rulebook ingestion (`convex/ingestion.ts`) sends each page-range slice to Gemini
**inline**: `{ type: "file", data: bytes, mediaType: "application/pdf" }`. Gemini's
inline-request cap is ~20MB, and inline data is base64-encoded (+~33%), so the
real ceiling is a raw slice of ~14–15MB.

Phase 1 (`pagesPerBatchFor` in `convex/lib/pdf.ts`) sizes batches to the file so
image-heavy PDFs use fewer pages per slice. That fixes the common case, but it
**can't fix a single page larger than ~14MB** — a 1-page slice still can't be
inlined. The Files API removes the cap entirely.

## Solution

Upload each page-range slice to the **Gemini Files API** (≤2GB, ≤1000 pages per
file) and reference it by `fileUri` instead of inlining the bytes. No 20MB cap,
no base64 inflation. Keep the existing slicing (so per-batch token cost stays
low — we only pay for that slice's pages, not the whole manual).

### Flow (minimal change, composes with Phase 1)

`extractMarkdown(bytes, …)` changes from inline bytes to:

1. **Upload** the slice: `POST https://generativelanguage.googleapis.com/upload/v1beta/files`
   (resumable upload) with `GOOGLE_GENERATIVE_AI_API_KEY` (already set) →
   returns a file resource with `uri` and `state`.
2. **Poll** `GET .../v1beta/files/{name}` until `state === "ACTIVE"` (PDFs are
   usually ready immediately; a short poll with backoff covers the rest).
3. **Generate**: pass the file by URI instead of data. With `@ai-sdk/google`,
   a file part accepts a URL — forward the `fileUri` as
   `{ type: "file", data: new URL(fileUri), mediaType: "application/pdf" }`
   (verify the provider maps a URL part to Gemini `fileData`; if not, drop to the
   `@google/genai` SDK for the upload + call, keeping the same prompt).
4. **Delete** the file after the batch (`DELETE .../files/{name}`), or let it
   expire — Files API files auto-expire after **48h**.

Everything else (the extraction prompt, per-page recovery fallback, chunking,
embedding) is unchanged — only the transport for the slice changes.

### Where it touches

- `convex/ingestion.ts` → `extractMarkdown`: upload+reference instead of inline.
- new `convex/lib/geminiFiles.ts`: `uploadPdf(bytes) → { uri, name }`,
  `waitActive(name)`, `deletePdf(name)` (thin REST wrappers; `"use node"`).
- No schema change (slicing/plan stay the same). `pagesPerBatchFor`'s `max` could
  be raised once the cap is gone, but keep it modest so output tokens
  (`maxOutputTokens`) don't truncate a batch.

### Risks / notes

- **Gemini-specific** — fine, the content/ingestion model is Gemini-only.
- **Rate/limits** — Files API has its own quotas; uploads are cheap but add a
  round-trip per slice. Negligible vs. the model call.
- **Cost** — unchanged: we still slice, so each request only sees that slice's
  pages (~258 tokens/page + images). Uploading the whole manual once and
  page-range-prompting it would be simpler but pays whole-file input tokens per
  batch — avoid.
- **Cleanup** — delete per slice to stay tidy; expiry is the backstop.

## Decision needed

- Go with per-slice upload (recommended, above), or whole-file-once + page-range
  prompting (simpler code, higher token cost)?
- Keep page slicing at all, or upload the whole PDF once and let Gemini read all
  pages (only viable for small manuals due to output-token truncation)?
