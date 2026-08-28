/**
 * Regenerates public/icons/icon-*.webp from public/logo.webp.
 *
 * The old icons were a tight crop that sliced the antenna ball off the top, and
 * they were transparent — which iOS composites onto black and which left the
 * Android splash showing the manifest's background_color straight through. So
 * each icon is now the logo on the app's cream background, cropped square from
 * the top of the antenna down through the manual, with a padded margin.
 *
 * Rendering goes through Chromium's canvas (best-quality downscaling, and it
 * encodes WebP), so this needs Playwright — a dev-only tool, deliberately not a
 * project dependency:
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/generateIcons.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "public/logo.webp");
const OUT_DIR = path.join(ROOT, "public/icons");

const SIZES = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512];
/** The app's light background (--background in app/globals.css). */
const BACKGROUND = "#faf6ee";
/**
 * Square crop of the 1851x2312 source: the full width, from the very top of the
 * antenna down through the widest part of the manual. Cutting below that keeps
 * the head large enough to read at 48px.
 */
const CROP = { x: 0, y: 0, w: 1851, h: 1850 };
/** Margin on every side, as a fraction of the icon — keeps art off the edge. */
const PADDING = 0.12;
/**
 * Lossless. At any lossy setting the flat cream drifts a step (250,247,239
 * instead of 250,246,238), which shows up as a faint square outline where the
 * icon meets the splash screen's background_color.
 */
const QUALITY = 1;

const source = fs.readFileSync(SOURCE).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of SIZES) {
  const dataUrl = await page.evaluate(
    async ({ source, crop, size, padding, background, quality }) => {
      const img = new Image();
      img.src = "data:image/webp;base64," + source;
      await img.decode();

      const box = Math.round(size * (1 - padding * 2));
      const scale = Math.min(box / crop.w, box / crop.h);
      const w = Math.round(crop.w * scale);
      const h = Math.round(crop.h * scale);

      // Render at 4x and halve repeatedly: one big drawImage down to 48px
      // aliases badly, stepped downscaling stays clean.
      let step = document.createElement("canvas");
      step.width = w * 4;
      step.height = h * 4;
      let ctx = step.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, step.width, step.height);
      while (step.width > w * 2) {
        const next = document.createElement("canvas");
        next.width = Math.max(w, Math.round(step.width / 2));
        next.height = Math.max(h, Math.round(step.height / 2));
        const nextCtx = next.getContext("2d");
        nextCtx.imageSmoothingQuality = "high";
        nextCtx.drawImage(step, 0, 0, next.width, next.height);
        step = next;
      }

      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const o = out.getContext("2d");
      o.fillStyle = background;
      o.fillRect(0, 0, size, size);
      o.imageSmoothingQuality = "high";
      o.drawImage(step, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
      return out.toDataURL("image/webp", quality);
    },
    { source, crop: CROP, size, padding: PADDING, background: BACKGROUND, quality: QUALITY },
  );

  const file = path.join(OUT_DIR, `icon-${size}x${size}.webp`);
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(file, bytes);
  console.log(`  ${path.relative(ROOT, file)}  ${bytes.length} bytes`);
}

await browser.close();
