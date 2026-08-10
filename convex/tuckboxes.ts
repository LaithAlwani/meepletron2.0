import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";

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
  storageId: v.id("_storage"),
  naturalWidth: v.number(),
  naturalHeight: v.number(),
  transform: transformV,
});

const wrapV = v.object({
  storageId: v.id("_storage"),
  naturalWidth: v.number(),
  naturalHeight: v.number(),
  transform: transformV,
});

/** Mint a short-lived upload URL for a signed-in user's face artwork. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
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
    const cover =
      rest.wrap?.storageId ??
      rest.faces.find((f) => f.face === "front")?.storageId ??
      rest.faces[0]?.storageId;
    const doc = {
      ...rest,
      userId: user._id,
      coverStorageId: cover,
      updatedAt: Date.now(),
    };
    if (id) {
      const existing = await ctx.db.get("tuckboxes", id);
      if (!existing || existing.userId !== user._id) {
        throw new Error("Not found");
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
        coverUrl: r.coverStorageId
          ? await ctx.storage.getUrl(r.coverStorageId)
          : null,
      })),
    );
  },
});

/** A single saved box (owned), with signed URLs for each face/wrap image. */
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
        url: await ctx.storage.getUrl(f.storageId),
      })),
    );
    const wrap = box.wrap
      ? { ...box.wrap, url: await ctx.storage.getUrl(box.wrap.storageId) }
      : null;
    return { ...box, faces, wrap };
  },
});

/** Delete a saved box and its (unshared) image blobs. */
export const remove = mutation({
  args: { id: v.id("tuckboxes") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const box = await ctx.db.get("tuckboxes", id);
    if (!box || box.userId !== user._id) return;
    const ids = new Set(box.faces.map((f) => f.storageId));
    if (box.wrap) ids.add(box.wrap.storageId);
    for (const sid of ids) await ctx.storage.delete(sid);
    await ctx.db.delete("tuckboxes", id);
  },
});
