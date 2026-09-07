"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { Download, Upload, Check, FolderOpen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { putToSignedUrl } from "@/components/lib/r2Upload";
import { computeLayout, getPanel } from "@/lib/tuckbox/geometry";
import { renderTuckboxPdf, triggerDownload } from "@/lib/tuckbox/pdf";
import {
  DEFAULT_IMAGE_TRANSFORM,
  idealPixelsForPanel,
  type FaceAssets,
  type FaceImageData,
  type FaceImageTransform,
  type FaceKey,
  type ImageRotation,
  type Orientation,
  type PaperSize,
  type TuckboxConfig,
  type Unit,
} from "@/lib/tuckbox/types";
import { FlatNetPreview } from "./FlatNetPreview";
import { AssembledBoxPreview } from "./AssembledBoxPreview";
import { ImagePositioner } from "./ImagePositioner";
import { MyBoxesModal } from "./MyBoxesModal";

export type InitialBoardgame = {
  title?: string;
  imageUrl?: string;
};

const DEFAULT_CONFIG_MM: TuckboxConfig = {
  unit: "mm",
  cardWidth: 63,
  cardHeight: 88,
  stackThickness: 20,
  tolerance: 1,
  materialThickness: 0.3,
  paperSize: "A4",
  orientation: "portrait",
};
const DEFAULT_CARD_THICKNESS_MM = 0.32;

// Default is inches (values = the mm defaults converted, matching setUnit's
// rounding so the "Standard 63×88" preset still reads as active).
const DEFAULT_CONFIG_IN: TuckboxConfig = {
  unit: "in",
  cardWidth: 2.48,
  cardHeight: 3.46,
  stackThickness: 0.79,
  tolerance: 0.039,
  materialThickness: 0.012,
  paperSize: "Letter", // inches → US default paper
  orientation: "portrait",
};
const DEFAULT_CARD_THICKNESS_IN = 0.0126;
const UNIT_STORAGE_KEY = "tuckbox-unit";

const FACE_KEYS: FaceKey[] = [
  "front",
  "back",
  "leftSide",
  "rightSide",
  "top",
  "bottom",
];

/** Short face labels for the faces bar. */
const FACE_SHORT: Record<FaceKey, string> = {
  front: "Front",
  back: "Back",
  leftSide: "Left spine",
  rightSide: "Right spine",
  top: "Top",
  bottom: "Bottom",
};

/** Common card sizes (mm) offered as one-tap presets. */
const CARD_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "Standard", w: 63, h: 88 },
  { label: "Mini", w: 44, h: 68 },
  { label: "Tarot", w: 70, h: 120 },
  { label: "Square", w: 70, h: 70 },
];

const PAPER_OPTIONS: PaperSize[] = ["A4", "Letter", "A3"];

const BODY_FACES: FaceKey[] = ["front", "back", "leftSide", "rightSide"];
const isBodyFace = (face: FaceKey) => BODY_FACES.includes(face);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = url;
  });
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  // Remote images (BGG CDN, Convex storage) are read through our same-origin
  // proxy so grabbing their bytes isn't blocked by cross-origin CORS. Local
  // data:/blob: URLs are fetched directly.
  const src = /^https?:\/\//i.test(url)
    ? `/api/image?url=${encodeURIComponent(url)}`
    : url;
  const response = await fetch(src, { mode: "cors" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function TuckboxDesigner({
  initialBoardgame,
}: {
  initialBoardgame?: InitialBoardgame;
}) {
  const [config, setConfig] = useState<TuckboxConfig>(DEFAULT_CONFIG_IN);
  const [cardCount, setCardCount] = useState(60);
  const [cardThickness, setCardThickness] = useState(DEFAULT_CARD_THICKNESS_IN);
  const [assets, setAssets] = useState<FaceAssets>({});
  const [imageMode, setImageMode] = useState<"per-face" | "wrap">("per-face");
  const [wrapAsset, setWrapAsset] = useState<FaceImageData | undefined>(
    undefined,
  );
  const [previewTab, setPreviewTab] = useState<"assembled" | "flat">("flat");
  const [selectedFace, setSelectedFace] = useState<FaceKey | "wrap">("front");
  const [busy, setBusy] = useState(false);

  // --- persistence / autosave ---
  const me = useQuery(api.users.me);
  const signedIn = me != null;
  const saveMut = useMutation(api.tuckboxes.save);
  const genUploadUrl = useMutation(api.tuckboxes.generateUploadUrl);
  const syncMetadata = useMutation(api.r2.syncMetadata);
  const [boxId, setBoxId] = useState<Id<"tuckboxes"> | null>(null);
  const [boxName, setBoxName] = useState(
    initialBoardgame?.title?.trim() || "Untitled box",
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [myBoxesOpen, setMyBoxesOpen] = useState(false);
  const [loadId, setLoadId] = useState<Id<"tuckboxes"> | null>(null);

  // Marks that the user has made a real edit (prefill/hydration don't count, so
  // merely visiting — or opening a saved box — never spawns a duplicate).
  const touchedRef = useRef(false);
  const touch = () => {
    touchedRef.current = true;
  };
  // dataURL → uploaded storageId, so identical images upload only once.
  // Maps an image data-URL to the R2 object key it was uploaded as, so re-saves
  // of unchanged artwork skip re-uploading.
  const storageCacheRef = useRef<Map<string, string>>(new Map());

  const effectiveConfig: TuckboxConfig = useMemo(
    () => ({
      ...config,
      stackThickness: Math.max(1, cardCount * cardThickness),
    }),
    [config, cardCount, cardThickness],
  );

  const layout = useMemo(
    () => computeLayout(effectiveConfig),
    [effectiveConfig],
  );

  // Pre-fill from a board game (image → all 6 face images + wrap). Runs once per
  // imageUrl change. Does NOT mark the design touched.
  useEffect(() => {
    if (!initialBoardgame) return;
    let cancelled = false;

    if (initialBoardgame.imageUrl) {
      const imageUrl = initialBoardgame.imageUrl;
      (async () => {
        try {
          const dataUrl = await fetchImageAsDataUrl(imageUrl);
          const dimensions = await loadImageDimensions(dataUrl);
          if (cancelled) return;
          setAssets((previousAssets) => {
            const next = { ...previousAssets };
            let changed = false;
            for (const face of FACE_KEYS) {
              if (!next[face]) {
                next[face] = {
                  url: dataUrl,
                  naturalWidth: dimensions.width,
                  naturalHeight: dimensions.height,
                  transform: { ...DEFAULT_IMAGE_TRANSFORM },
                };
                changed = true;
              }
            }
            return changed ? next : previousAssets;
          });
          setWrapAsset((previousWrap) =>
            previousWrap
              ? previousWrap
              : {
                  url: dataUrl,
                  naturalWidth: dimensions.width,
                  naturalHeight: dimensions.height,
                  transform: { ...DEFAULT_IMAGE_TRANSFORM },
                },
          );
        } catch {
          // CORS blocked or fetch failed — leave the faces empty.
        }
      })();
    }

    return () => {
      cancelled = true;
    };
    // Only re-run when the image URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBoardgame?.imageUrl]);

  // Restore the user's preferred unit (default: inches). The initial state is
  // the inches default, so we only switch when they last chose mm. Runs once,
  // client-only; doesn't mark the design edited.
  useEffect(() => {
    if (localStorage.getItem(UNIT_STORAGE_KEY) === "mm") {
      setConfig(DEFAULT_CONFIG_MM);
      setCardThickness(DEFAULT_CARD_THICKNESS_MM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-view tool: on desktop the tool fills the viewport and its panels scroll
  // internally, so the page itself must never scroll. Pixel-perfect height math
  // is brittle, so also pin the body's overflow (desktop only — mobile stacks
  // and needs to scroll). Restored on unmount / when narrowing to mobile.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      document.body.style.overflow = mq.matches ? "hidden" : "";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.body.style.overflow = "";
    };
  }, []);

  function updateConfig<K extends keyof TuckboxConfig>(
    key: K,
    value: TuckboxConfig[K],
  ) {
    touch();
    setConfig((previousConfig) => ({ ...previousConfig, [key]: value }));
  }

  function setUnit(unit: Unit) {
    if (unit === config.unit) return;
    touch();
    try {
      localStorage.setItem(UNIT_STORAGE_KEY, unit);
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
    if (unit === "in") {
      setConfig({
        unit: "in",
        cardWidth: +(config.cardWidth / 25.4).toFixed(2),
        cardHeight: +(config.cardHeight / 25.4).toFixed(2),
        stackThickness: +(config.stackThickness / 25.4).toFixed(2),
        tolerance: +(config.tolerance / 25.4).toFixed(3),
        materialThickness: +(config.materialThickness / 25.4).toFixed(3),
        paperSize: config.paperSize,
        orientation: config.orientation,
      });
      setCardThickness(+(cardThickness / 25.4).toFixed(4));
    } else {
      setConfig({
        unit: "mm",
        cardWidth: +(config.cardWidth * 25.4).toFixed(1),
        cardHeight: +(config.cardHeight * 25.4).toFixed(1),
        stackThickness: +(config.stackThickness * 25.4).toFixed(1),
        tolerance: +(config.tolerance * 25.4).toFixed(2),
        materialThickness: +(config.materialThickness * 25.4).toFixed(2),
        paperSize: config.paperSize,
        orientation: config.orientation,
      });
      setCardThickness(+(cardThickness * 25.4).toFixed(2));
    }
  }

  function applyCardPreset(wMm: number, hMm: number) {
    touch();
    const factor = config.unit === "mm" ? 1 : 1 / 25.4;
    const round = (n: number) =>
      config.unit === "mm" ? +n.toFixed(1) : +n.toFixed(2);
    setConfig((prev) => ({
      ...prev,
      cardWidth: round(wMm * factor),
      cardHeight: round(hMm * factor),
    }));
  }

  function cardPresetActive(wMm: number, hMm: number) {
    const toMm = config.unit === "mm" ? 1 : 25.4;
    return (
      Math.abs(config.cardWidth * toMm - wMm) < 0.6 &&
      Math.abs(config.cardHeight * toMm - hMm) < 0.6
    );
  }

  async function handleImageUpload(face: FaceKey, file: File | undefined) {
    touch();
    if (!file) {
      setAssets((previousAssets) => {
        const next = { ...previousAssets };
        delete next[face];
        return next;
      });
      return;
    }
    const url = await readFileAsDataUrl(file);
    const dimensions = await loadImageDimensions(url);
    setAssets((previousAssets) => ({
      ...previousAssets,
      [face]: {
        url,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        transform: { ...DEFAULT_IMAGE_TRANSFORM },
      } satisfies FaceImageData,
    }));
  }

  function updateTransform(face: FaceKey, transform: FaceImageTransform) {
    touch();
    setAssets((previousAssets) => {
      const current = previousAssets[face];
      if (!current) return previousAssets;
      return { ...previousAssets, [face]: { ...current, transform } };
    });
  }

  async function handleWrapUpload(file: File | undefined) {
    touch();
    if (!file) {
      setWrapAsset(undefined);
      return;
    }
    const url = await readFileAsDataUrl(file);
    const dimensions = await loadImageDimensions(url);
    setWrapAsset({
      url,
      naturalWidth: dimensions.width,
      naturalHeight: dimensions.height,
      transform: { ...DEFAULT_IMAGE_TRANSFORM },
    });
  }

  function updateWrapTransform(transform: FaceImageTransform) {
    touch();
    setWrapAsset((previousWrap) =>
      previousWrap ? { ...previousWrap, transform } : previousWrap,
    );
  }

  const wrapBodyWidth = layout.boxWidth * 2 + layout.boxDepth * 2;
  const wrapBodyHeight = layout.boxHeight;
  const wrapAspect = wrapBodyHeight > 0 ? wrapBodyWidth / wrapBodyHeight : 1;
  const wrapIdealPx = idealPixelsForPanel(
    wrapBodyWidth,
    wrapBodyHeight,
    layout.unit,
  );

  async function handleDownload() {
    if (layout.error) return;
    setBusy(true);
    try {
      const blob = await renderTuckboxPdf(
        layout,
        assets,
        imageMode === "wrap" ? wrapAsset : undefined,
      );
      triggerDownload(blob, "tuckbox.pdf");
    } finally {
      setBusy(false);
    }
  }

  const unitLabel = config.unit;

  function getFaceAspect(face: FaceKey): number {
    const panel = getPanel(layout, face);
    if (!panel || panel.height === 0) return 1;
    return panel.width / panel.height;
  }

  function getFaceIdealPx(face: FaceKey): { width: number; height: number } {
    const panel = getPanel(layout, face);
    if (!panel) return { width: 0, height: 0 };
    return idealPixelsForPanel(panel.width, panel.height, layout.unit);
  }

  function faceHasArt(face: FaceKey): boolean {
    if (imageMode === "wrap" && isBodyFace(face)) return !!wrapAsset;
    return !!assets[face];
  }

  const faceForEditor: FaceKey = selectedFace === "wrap" ? "front" : selectedFace;
  const isWrapView =
    imageMode === "wrap" &&
    (selectedFace === "wrap" || isBodyFace(faceForEditor));

  const activeData = isWrapView ? wrapAsset : assets[faceForEditor];
  const activeAspect = isWrapView ? wrapAspect : getFaceAspect(faceForEditor);
  const activeIdeal = isWrapView ? wrapIdealPx : getFaceIdealPx(faceForEditor);
  const activeName = isWrapView ? "Body wrap" : FACE_SHORT[faceForEditor];
  const activeMeta = isWrapView
    ? "front + back + spines"
    : `${FACE_KEYS.indexOf(faceForEditor) + 1} of 6 faces`;

  function onArtImage(file: File | undefined) {
    if (isWrapView) void handleWrapUpload(file);
    else void handleImageUpload(faceForEditor, file);
  }
  function onArtTransform(transform: FaceImageTransform) {
    if (isWrapView) updateWrapTransform(transform);
    else updateTransform(faceForEditor, transform);
  }
  function useOnAllFaces() {
    if (!activeData) return;
    touch();
    const src = activeData;
    setAssets(() => {
      const next: FaceAssets = {};
      for (const face of FACE_KEYS) {
        next[face] = {
          url: src.url,
          naturalWidth: src.naturalWidth,
          naturalHeight: src.naturalHeight,
          transform: { ...DEFAULT_IMAGE_TRANSFORM },
        };
      }
      return next;
    });
    if (imageMode === "wrap") {
      setWrapAsset({
        url: src.url,
        naturalWidth: src.naturalWidth,
        naturalHeight: src.naturalHeight,
        transform: { ...DEFAULT_IMAGE_TRANSFORM },
      });
    }
  }

  // Upload a data URL to R2 once; cache by content. Returns the R2 object key.
  async function ensureUploaded(dataUrl: string): Promise<string> {
    const cached = storageCacheRef.current.get(dataUrl);
    if (cached) return cached;
    const blob = await (await fetch(dataUrl)).blob();
    const { key, url } = await genUploadUrl({ name: boxName });
    await putToSignedUrl(url, blob);
    await syncMetadata({ key });
    storageCacheRef.current.set(dataUrl, key);
    return key;
  }

  // Latest-state save closure, refreshed each render so the debounce always
  // persists current values.
  const doSaveRef = useRef<() => Promise<void>>(async () => {});
  doSaveRef.current = async () => {
    const hasContent =
      Object.keys(assets).length > 0 || !!wrapAsset || boxId != null;
    if (!hasContent) return;
    setSaveState("saving");
    try {
      const faces = [];
      for (const face of FACE_KEYS) {
        const a = assets[face];
        if (!a) continue;
        const key = await ensureUploaded(a.url);
        faces.push({
          face,
          key,
          naturalWidth: a.naturalWidth,
          naturalHeight: a.naturalHeight,
          transform: {
            zoom: a.transform.zoom,
            anchorX: a.transform.anchorX,
            anchorY: a.transform.anchorY,
            rotation: a.transform.rotation,
          },
        });
      }
      let wrap:
        | {
            key: string;
            naturalWidth: number;
            naturalHeight: number;
            transform: {
              zoom: number;
              anchorX: number;
              anchorY: number;
              rotation: number;
            };
          }
        | undefined;
      if (wrapAsset) {
        const key = await ensureUploaded(wrapAsset.url);
        wrap = {
          key,
          naturalWidth: wrapAsset.naturalWidth,
          naturalHeight: wrapAsset.naturalHeight,
          transform: {
            zoom: wrapAsset.transform.zoom,
            anchorX: wrapAsset.transform.anchorX,
            anchorY: wrapAsset.transform.anchorY,
            rotation: wrapAsset.transform.rotation,
          },
        };
      }
      const id = await saveMut({
        id: boxId ?? undefined,
        name: boxName.trim() || "Untitled box",
        unit: config.unit,
        cardWidth: config.cardWidth,
        cardHeight: config.cardHeight,
        cardCount,
        cardThickness,
        tolerance: config.tolerance,
        materialThickness: config.materialThickness,
        paperSize: config.paperSize,
        orientation: config.orientation,
        imageMode,
        faces,
        wrap,
      });
      if (!boxId) setBoxId(id);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  // Debounced autosave — only once the user has actually edited something.
  useEffect(() => {
    if (!signedIn || !touchedRef.current) return;
    const t = setTimeout(() => void doSaveRef.current(), 1500);
    return () => clearTimeout(t);
  }, [config, cardCount, cardThickness, imageMode, assets, wrapAsset, boxName, signedIn]);

  // Hydrate the designer when the user opens a saved box.
  const loaded = useQuery(api.tuckboxes.get, loadId ? { id: loadId } : "skip");
  useEffect(() => {
    if (!loadId || !loaded || loaded._id !== loadId) return;
    let cancelled = false;
    (async () => {
      // Only R2-keyed artwork is cached; legacy Convex-blob faces are re-uploaded
      // to R2 on the next save (which migrates them).
      const cache = new Map<string, string>();
      const nextAssets: FaceAssets = {};
      for (const f of loaded.faces) {
        if (!f.url) continue;
        const dataUrl = await fetchImageAsDataUrl(f.url).catch(() => null);
        if (!dataUrl) continue;
        if (f.key) cache.set(dataUrl, f.key);
        nextAssets[f.face] = {
          url: dataUrl,
          naturalWidth: f.naturalWidth,
          naturalHeight: f.naturalHeight,
          transform: {
            zoom: f.transform.zoom,
            anchorX: f.transform.anchorX,
            anchorY: f.transform.anchorY,
            rotation: f.transform.rotation as ImageRotation,
          },
        };
      }
      let nextWrap: FaceImageData | undefined;
      if (loaded.wrap?.url) {
        const dataUrl = await fetchImageAsDataUrl(loaded.wrap.url).catch(
          () => null,
        );
        if (dataUrl) {
          if (loaded.wrap.key) cache.set(dataUrl, loaded.wrap.key);
          nextWrap = {
            url: dataUrl,
            naturalWidth: loaded.wrap.naturalWidth,
            naturalHeight: loaded.wrap.naturalHeight,
            transform: {
              zoom: loaded.wrap.transform.zoom,
              anchorX: loaded.wrap.transform.anchorX,
              anchorY: loaded.wrap.transform.anchorY,
              rotation: loaded.wrap.transform.rotation as ImageRotation,
            },
          };
        }
      }
      if (cancelled) return;
      storageCacheRef.current = cache;
      setConfig({
        unit: loaded.unit,
        cardWidth: loaded.cardWidth,
        cardHeight: loaded.cardHeight,
        stackThickness: Math.max(1, loaded.cardCount * loaded.cardThickness),
        tolerance: loaded.tolerance,
        materialThickness: loaded.materialThickness,
        paperSize: loaded.paperSize,
        orientation: loaded.orientation,
      });
      setCardCount(loaded.cardCount);
      setCardThickness(loaded.cardThickness);
      setImageMode(loaded.imageMode);
      setBoxName(loaded.name);
      setBoxId(loaded._id);
      setAssets(nextAssets);
      setWrapAsset(nextWrap);
      setSelectedFace("front");
      setSaveState("saved");
      touchedRef.current = false; // hydration is not an edit
      setLoadId(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, loadId]);

  function newBox() {
    setBoxId(null);
    setBoxName("Untitled box");
    const mm =
      typeof window !== "undefined" &&
      localStorage.getItem(UNIT_STORAGE_KEY) === "mm";
    setConfig(mm ? DEFAULT_CONFIG_MM : DEFAULT_CONFIG_IN);
    setCardThickness(mm ? DEFAULT_CARD_THICKNESS_MM : DEFAULT_CARD_THICKNESS_IN);
    setCardCount(60);
    setImageMode("per-face");
    setAssets({});
    setWrapAsset(undefined);
    setSelectedFace("front");
    storageCacheRef.current = new Map();
    setSaveState("idle");
    touchedRef.current = false;
  }

  const blankCount = FACE_KEYS.filter((f) => !faceHasArt(f)).length;
  const dims = `${layout.boxWidth.toFixed(1)} × ${layout.boxHeight.toFixed(
    1,
  )} × ${layout.boxDepth.toFixed(1)} ${layout.unit} · ${layout.pageWidth.toFixed(
    1,
  )} × ${layout.pageHeight.toFixed(1)} ${layout.unit}`;

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
      {/* Body: sidebar (controls) + main (preview) */}
      <div className="flex flex-1 flex-col overflow-hidden lg:min-h-0 lg:flex-row">
        <aside className="themed-scroll order-2 w-full divide-y divide-border overflow-y-auto border-t border-border lg:order-1 lg:w-[360px] lg:shrink-0 lg:border-r lg:border-t-0">
          {/* Box name, autosave, preview tabs, and box actions */}
          <div className="space-y-2.5 p-4">
            <input
              value={boxName}
              onChange={(e) => {
                touch();
                setBoxName(e.target.value);
              }}
              placeholder="Untitled box"
              aria-label="Box name"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {(
                  [
                    ["flat", "Flat net"],
                    ["assembled", "3D box"],
                  ] as const
                ).map(([value, tabLabel]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreviewTab(value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
                      previewTab === value
                        ? "bg-accent/10 text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
              {signedIn ? (
                <span className="flex items-center gap-1 whitespace-nowrap text-xs text-subtle">
                  {saveState === "saving" ? (
                    "Saving…"
                  ) : saveState === "saved" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-accent-2" /> Saved
                    </>
                  ) : saveState === "error" ? (
                    <span className="text-red-500">Save failed</span>
                  ) : (
                    "Autosaves"
                  )}
                </span>
              ) : (
                <Link
                  href="/auth"
                  className="whitespace-nowrap text-xs text-muted underline hover:text-foreground"
                >
                  Sign in to save
                </Link>
              )}
            </div>

            <div className="flex gap-2">
              {signedIn && (
                <button
                  onClick={() => setMyBoxesOpen(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <FolderOpen className="h-4 w-4" />
                  My boxes
                </button>
              )}
              <Link
                href="/boardgames"
                className="flex flex-1 items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                Open from a game
              </Link>
            </div>
          </div>

          {/* 01 — Card size */}
          <NumSection
            n="01"
            title="Card size"
            meta={unitLabel === "mm" ? "millimetres" : "inches"}
          >
            <div className="grid grid-cols-2 gap-2">
              {CARD_PRESETS.map((p) => (
                <PresetButton
                  key={p.label}
                  active={cardPresetActive(p.w, p.h)}
                  onClick={() => applyCardPreset(p.w, p.h)}
                >
                  {p.label} {p.w}×{p.h}
                </PresetButton>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Width" suffix={unitLabel}>
                <NumberInput
                  value={config.cardWidth}
                  step={config.unit === "mm" ? 0.5 : 0.05}
                  onChange={(v) => updateConfig("cardWidth", v)}
                />
              </Field>
              <Field label="Height" suffix={unitLabel}>
                <NumberInput
                  value={config.cardHeight}
                  step={config.unit === "mm" ? 0.5 : 0.05}
                  onChange={(v) => updateConfig("cardHeight", v)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cards">
                <NumberInput
                  value={cardCount}
                  step={1}
                  onChange={(v) => {
                    touch();
                    setCardCount(Math.max(1, Math.round(v)));
                  }}
                />
              </Field>
              <Field label="Per card" suffix={unitLabel}>
                <NumberInput
                  value={cardThickness}
                  step={config.unit === "mm" ? 0.01 : 0.001}
                  onChange={(v) => {
                    touch();
                    setCardThickness(v);
                  }}
                />
              </Field>
            </div>
            <div className="rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">
                Stack
              </span>{" "}
              <span className="font-display text-lg font-bold text-foreground">
                {(cardCount * cardThickness).toFixed(2)} {unitLabel}
              </span>
            </div>
          </NumSection>

          {/* 02 — Artwork */}
          <NumSection n="02" title="Artwork" meta={activeMeta}>
            <SegmentedControl
              value={imageMode}
              onChange={(v) => {
                touch();
                setImageMode(v as "per-face" | "wrap");
              }}
              options={[
                { value: "per-face", label: "Per face" },
                { value: "wrap", label: "Wrap around" },
              ]}
            />

            {/* Pick which face to edit — filled dot = has artwork. */}
            <div className="grid grid-cols-3 gap-1.5">
              {FACE_KEYS.map((face) => {
                const active = faceForEditor === face;
                const filled = faceHasArt(face);
                return (
                  <button
                    key={face}
                    type="button"
                    onClick={() => setSelectedFace(face)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        filled
                          ? active
                            ? "bg-accent-foreground"
                            : "bg-accent"
                          : active
                            ? "bg-accent-foreground/40"
                            : "bg-border"
                      }`}
                    />
                    <span className="truncate">{FACE_SHORT[face]}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-foreground">
                {activeName}
              </h3>
              <span className="text-[11px] text-subtle">
                {activeIdeal.width} × {activeIdeal.height} px @300DPI
              </span>
            </div>

            {!activeData ? (
              <ImageDropzone onFile={onArtImage} />
            ) : (
              <div className="space-y-2">
                <ImagePositioner
                  data={activeData}
                  frameAspect={activeAspect}
                  onChange={onArtTransform}
                />
                <ImageDropzone onFile={onArtImage} compact />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <SmallButton
                onClick={() => onArtImage(undefined)}
                disabled={!activeData}
              >
                Clear face
              </SmallButton>
              <SmallButton onClick={useOnAllFaces} disabled={!activeData}>
                Use cover on all
              </SmallButton>
            </div>
          </NumSection>

          {/* 03 — Paper & fit */}
          <NumSection n="03" title="Paper & fit">
            <div className="grid grid-cols-3 gap-2">
              {PAPER_OPTIONS.map((p) => (
                <PresetButton
                  key={p}
                  active={config.paperSize === p}
                  onClick={() => updateConfig("paperSize", p)}
                >
                  {p}
                </PresetButton>
              ))}
            </div>
            <div>
              <ReadRow
                label="Finished box"
                value={`${layout.boxWidth.toFixed(1)} × ${layout.boxHeight.toFixed(
                  1,
                )} × ${layout.boxDepth.toFixed(1)} ${layout.unit}`}
              />
              <ReadRow
                label="Page"
                value={`${layout.pageWidth.toFixed(1)} × ${layout.pageHeight.toFixed(
                  1,
                )} ${layout.unit}`}
              />
              <ReadRow
                label="Tolerance"
                value={`+${config.tolerance} ${unitLabel} · ${config.materialThickness} ${unitLabel} material`}
              />
            </div>

            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-accent">
                Advanced — tolerance &amp; material
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tolerance" suffix={unitLabel}>
                    <NumberInput
                      value={config.tolerance}
                      step={config.unit === "mm" ? 0.1 : 0.01}
                      onChange={(v) => updateConfig("tolerance", v)}
                    />
                  </Field>
                  <Field label="Material" suffix={unitLabel}>
                    <NumberInput
                      value={config.materialThickness}
                      step={config.unit === "mm" ? 0.05 : 0.005}
                      onChange={(v) => updateConfig("materialThickness", v)}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">
                      Orientation
                    </span>
                    <SegmentedControl
                      value={config.orientation}
                      onChange={(v) =>
                        updateConfig("orientation", v as Orientation)
                      }
                      options={[
                        { value: "portrait", label: "Portrait" },
                        { value: "landscape", label: "Landscape" },
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-subtle">
                      Units
                    </span>
                    <SegmentedControl
                      value={config.unit}
                      onChange={(v) => setUnit(v as Unit)}
                      options={[
                        { value: "mm", label: "mm" },
                        { value: "in", label: "in" },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </details>
          </NumSection>
        </aside>

        {/* Preview */}
        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div className="min-h-[340px] flex-1 overflow-auto p-3 lg:min-h-0">
            {previewTab === "assembled" ? (
              <AssembledBoxPreview
                layout={layout}
                assets={assets}
                wrapAsset={imageMode === "wrap" ? wrapAsset : undefined}
              />
            ) : (
              <FlatNetPreview
                layout={layout}
                assets={assets}
                wrapAsset={imageMode === "wrap" ? wrapAsset : undefined}
                selectedFace={selectedFace}
                onSelectFace={(f) => f && setSelectedFace(f)}
                onTransformChange={updateTransform}
                onWrapTransform={updateWrapTransform}
              />
            )}
          </div>
        </main>
      </div>

      {/* Status + download */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-accent px-4 py-3 text-accent-foreground">
        <div className="min-w-0">
          <p className="font-display font-bold leading-tight">
            {layout.error
              ? layout.error
              : blankCount > 0
                ? `Ready — ${blankCount} face${blankCount === 1 ? "" : "s"} still blank`
                : "Ready to print"}
          </p>
          <p className="truncate text-xs opacity-90">{dims}</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!!layout.error || busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-accent shadow-sm transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {busy ? "Generating…" : "Download print-ready PDF"}
        </button>
      </div>

      <MyBoxesModal
        open={myBoxesOpen}
        onClose={() => setMyBoxesOpen(false)}
        onOpenBox={(id) => setLoadId(id)}
        onNewBox={newBox}
        currentId={boxId}
      />
    </div>
  );
}

/* ---------- layout primitives ---------- */

function NumSection({
  n,
  title,
  meta,
  children,
}: {
  n: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 px-4 py-4 lg:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
          <span className="text-accent">{n} / </span>
          <span className="text-foreground">{title}</span>
        </h2>
        {meta && <span className="text-[11px] text-subtle">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SmallButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-border-muted py-1.5 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-subtle">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {suffix && <span className="shrink-0 text-xs text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

function NumberInput({
  value,
  step,
  onChange,
}: {
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState<string>(() => String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      value={text}
      step={step}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = parseFloat(next);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        focusedRef.current = false;
        const parsed = parseFloat(text);
        if (Number.isNaN(parsed)) {
          setText(String(value));
        } else if (parsed !== value) {
          onChange(parsed);
        }
      }}
      className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-0.5 text-xs font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1 transition-colors ${
            value === option.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Custom drag-and-drop / click image uploader. `compact` is for "replace". */
function ImageDropzone({
  onFile,
  compact = false,
}: {
  onFile: (file: File | undefined) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(list: FileList | null | undefined) {
    const file = list?.[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        pick(event.dataTransfer.files);
      }}
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors ${
        compact ? "px-3 py-2" : "flex-col px-4 py-6"
      } ${
        dragging
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted hover:border-accent/50 hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Upload className="h-5 w-5 shrink-0" />
      <div>
        <div className="text-sm font-medium">
          {compact ? "Replace image" : "Drop image or click to upload"}
        </div>
        {!compact && <div className="mt-0.5 text-xs text-subtle">PNG or JPG</div>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
