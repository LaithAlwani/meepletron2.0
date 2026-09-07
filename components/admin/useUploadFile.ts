"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { putToSignedUrl } from "@/components/lib/r2Upload";

/**
 * Returns an uploader for admin rulebook/download files: mints a structured R2
 * upload URL (foldered under the game's slug), PUTs the file, syncs its
 * metadata, and returns the R2 object key to attach via `addRulebook`.
 */
export function useUploadFile() {
  const generateUploadUrl = useMutation(
    api.rulebooks.generateRulebookUploadUrl,
  );
  const syncMetadata = useMutation(api.r2.syncMetadata);
  return async (gameId: Id<"games">, file: File): Promise<string> => {
    const { key, url } = await generateUploadUrl({
      gameId,
      filename: file.name,
    });
    await putToSignedUrl(url, file);
    await syncMetadata({ key });
    return key;
  };
}
