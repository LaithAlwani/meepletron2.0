import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, requireUser } from "./lib/auth";
import { r2, deleteMedia } from "./r2";
import { tuckboxKey } from "./lib/r2keys";
import { imageUrl } from "./lib/media";

const transformV = v.object({
  zoom: v.number(),
  anchorX: v.number(),
  anchorY: v.number(),
  rotation: v.number(),
});

const faceV = v.object({
  face: v.union(
    v.literal("front"),
    v.literal("back"),
    v.literal("leftSide"),
    v.literal("rightSide"),
    v.literal("top"),
    v.literal("bottom"),
  ),
  // R2 object key (new) or legacy Convex blob id (editing an un-migrated box).
  key: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  naturalWidth: v.number(),
  naturalHeight: v.number(),
  transform: transformV,
});

const wrapV = v.object({
  key: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  naturalWidth: v.number(),
  naturalHeight: v.number(),
  transform: transformV,
});

/**
 * Mint a short-lived R2 upload URL for a signed-in user's face artwork. Keys are
 * foldered by the box name (never an id). The client PUTs the blob to `url`, then
 * records `key` on the face when it saves.
 */
export const generateUploadUrl = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireUser(ctx);
    return await r2.generateUploadUrl(tuckboxKey(name || "box", crypto.randomUUID()));
  },
});

/** Create or update (autosave) the caller's tuckbox design. Returns its id. */
export const save = mutation({
  args: {
    id: v.optional(v.id("tuckboxes")),
    name: v.string(),
    unit: v.union(v.literal("mm"), v.literal("in")),
    cardWidth: v.number(),
    cardHeight: v.number(),
    cardCount: v.number(),
    cardThickness: v.number(),
    tolerance: v.number(),
    materialThickness: v.number(),
    paperSize: v.union(v.literal("A4"), v.literal("Letter"), v.literal("A3")),
    orientation: v.union(v.literal("portrait"), v.literal("landscape")),
    imageMode: v.union(v.literal("per-face"), v.literal("wrap")),
    faces: v.array(faceV),
    wrap: v.optional(wrapV),
  },
  handler: async (ctx, { id, ...rest }) => {
    const user = await requireUser(ctx);
    const coverSrc =
      rest.wrap ??
      rest.faces.find((f) => f.face === "front") ??
      rest.faces[0];
    const doc = {
      ...rest,
      userId: user._id,
      coverKey: coverSrc?.key,
      coverStorageId: coverSrc?.storageId,
      updatedAt: Date.now(),
    };
    if (id) {
      const existing = await ctx.db.get("tuckboxes", id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Not found");
      }
      // Free any image no longer referenced after this save (replaced artwork),
      // across both stores.
      const usedKeys = new Set<string>();
      const usedIds = new Set<Id<"_storage">>();
      for (const f of [...rest.faces, ...(rest.wrap ? [rest.wrap] : [])]) {
        if (f.key) usedKeys.add(f.key);
        if (f.storageId) usedIds.add(f.storageId);
      }
      for (const f of [
        ...existing.faces,
        ...(existing.wrap ? [existing.wrap] : []),
      ]) {
        if (f.key && !usedKeys.has(f.key)) await deleteMedia(ctx, f.key, null);
        else if (f.storageId && !usedIds.has(f.storageId)) {
          await deleteMedia(ctx, null, f.storageId);
        }
      }
      await ctx.db.patch("tuckboxes", id, doc);
      return id;
    }
    return await ctx.db.insert("tuckboxes", doc);
  },
});

/** The caller's saved boxes (newest first) with a thumbnail URL. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query("tuckboxes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        name: r.name,
        updatedAt: r.updatedAt,
        faceCount: r.faces.length,
        coverUrl: await imageUrl(ctx, r.coverKey, r.coverStorageId),
      })),
    );
  },
});

/** A single saved box (owned), with URLs for each face/wrap image. */
export const get = query({
  args: { id: v.id("tuckboxes") },
  handler: async (ctx, { id }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const box = await ctx.db.get("tuckboxes", id);
    if (!box || box.userId !== user._id) return null;
    const faces = await Promise.all(
      box.faces.map(async (f) => ({
        ...f,
        url: await imageUrl(ctx, f.key, f.storageId),
      })),
    );
    const wrap = box.wrap
      ? { ...box.wrap, url: await imageUrl(ctx, box.wrap.key, box.wrap.storageId) }
      : null;
    return { ...box, faces, wrap };
  },
});

/** Delete a saved box and its (unshared) images. */
export const remove = mutation({
  args: { id: v.id("tuckboxes") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const box = await ctx.db.get("tuckboxes", id);
    if (!box || box.userId !== user._id) return;
    for (const f of [...box.faces, ...(box.wrap ? [box.wrap] : [])]) {
      await deleteMedia(ctx, f.key, f.storageId);
    }
    await ctx.db.delete("tuckboxes", id);
  },
});
