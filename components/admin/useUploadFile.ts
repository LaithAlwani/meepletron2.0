"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Returns an uploader: POSTs a file to a fresh Convex upload URL → storageId. */
export function useUploadFile() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  return async (file: File): Promise<Id<"_storage">> => {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  };
}
