"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/node";

const MAX_WIDTH = 800;
const THUMB_WIDTH = 256;
const JPEG_QUALITY = 82;
const MAX_FETCH_BYTES = 15 * 1024 * 1024;

/**
 * Downscale (if wider than maxWidth) and re-encode as JPEG via WASM Photon.
 * Returns `null` if the image can't be decoded so callers can fall back.
 */
function encodeJpeg(original: Uint8Array, maxWidth: number): Uint8Array | null {
  try {
    const img = PhotonImage.new_from_byteslice(original);
    const w = img.get_width();
    const h = img.get_height();
    let source = img;
    let resized: PhotonImage | null = null;
    if (w > maxWidth) {
      const targetH = Math.max(1, Math.round(h * (maxWidth / w)));
      resized = resize(img, maxWidth, targetH, SamplingFilter.Lanczos3);
      source = resized;
    }
    const jpeg = source.get_bytes_jpeg(JPEG_QUALITY);
    img.free();
    if (resized) resized.free();
    return jpeg;
  } catch {
    return null;
  }
}

/**
 * Admin: set a game's cover from an image URL. Fetches the image server-side
 * (no CORS), compresses it (downscale to <=800px + JPEG q82 via WASM Photon),
 * keeps whichever is smaller, and stores only that in Convex storage.
 */
export const setGameCoverFromUrl = action({
  args: { gameId: v.id("games"), url: v.string() },
  handler: async (ctx, { gameId, url }) => {
    await ctx.runQuery(internal.users.ensureAdmin, {});

    if (!/^https?:\/\//i.test(url.trim())) {
      throw new Error("Enter a valid http(s) image URL");
    }

    const res = await fetch(url.trim());
    if (!res.ok) throw new Error("Couldn't fetch that URL");
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error("That URL doesn't point to an image");
    }
    const original = new Uint8Array(await res.arrayBuffer());
    if (original.byteLength === 0) throw new Error("The image was empty");
    if (original.byteLength > MAX_FETCH_BYTES) {
      throw new Error("That image is too large (max 15 MB)");
    }

    // Cover: compress (best-effort — store original if it can't be decoded or
    // compression didn't actually shrink it).
    const coverJpeg = encodeJpeg(original, MAX_WIDTH);
    let outBytes: Uint8Array = original;
    let outType = contentType;
    if (coverJpeg && coverJpeg.byteLength < original.byteLength) {
      outBytes = coverJpeg;
      outType = "image/jpeg";
    }
    const storageId = await ctx.storage.store(
      new Blob([Buffer.from(outBytes)], { type: outType }),
    );

    // Thumbnail: a small dedicated crop for grids/lists. Only store a separate
    // blob when we could actually decode + shrink it; otherwise the cover is
    // reused (setGameImage aliases thumbnail → cover when none is given).
    let thumbnailId: Id<"_storage"> | undefined;
    const thumbJpeg = encodeJpeg(original, THUMB_WIDTH);
    if (thumbJpeg && thumbJpeg.byteLength < outBytes.byteLength) {
      thumbnailId = await ctx.storage.store(
        new Blob([Buffer.from(thumbJpeg)], { type: "image/jpeg" }),
      );
    }

    // Reuse the admin-gated mutation (auth propagates from this action).
    await ctx.runMutation(api.games.setGameImage, {
      gameId,
      storageId,
      thumbnailId,
    });
  },
});
