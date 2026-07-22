"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeLayout, getPanel } from "@/lib/tuckbox/geometry";
import { renderTuckboxPdf, triggerDownload } from "@/lib/tuckbox/pdf";
import {
  DEFAULT_IMAGE_TRANSFORM,
  idealPixelsForPanel,
  type FaceAssets,
  type FaceImageData,
  type FaceImageTransform,
  type FaceKey,
  type FaceLabels,
  type FontFamily,
  type FontStyle,
  type Orientation,
  type PaperSize,
  type TextLabel,
  type TuckboxConfig,
  type Unit,
} from "@/lib/tuckbox/types";
import { FlatNetPreview } from "./FlatNetPreview";
import { AssembledBoxPreview } from "./AssembledBoxPreview";
import { ImagePositioner } from "./ImagePositioner";
import { AssemblyInstructions } from "./AssemblyInstructions";

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

const FACE_KEYS: FaceKey[] = [
  "front",
  "back",
  "leftSide",
  "rightSide",
  "top",
  "bottom",
];

const FACE_LABELS_DISPLAY: Record<FaceKey, string> = {
  front: "Front",
  back: "Back",
  leftSide: "Left side (spine)",
  rightSide: "Right side (spine)",
  top: "Top",
  bottom: "Bottom",
};

function makeDefaultLabel(): TextLabel {
  return {
    text: "",
    family: "sans",
    style: "bold",
    sizePt: 24,
    color: "#111111",
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

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
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function TuckboxDesigner({
  initialBoardgame,
}: {
  initialBoardgame?: InitialBoardgame;
}) {
  const [config, setConfig] = useState<TuckboxConfig>(DEFAULT_CONFIG_MM);
  const [useCardCount, setUseCardCount] = useState(true);
  const [cardCount, setCardCount] = useState(60);
  const [cardThickness, setCardThickness] = useState(0.32);
  const [assets, setAssets] = useState<FaceAssets>({});
  const [labels, setLabels] = useState<FaceLabels>({});
  const [imageMode, setImageMode] = useState<"per-face" | "wrap">("per-face");
  const [wrapAsset, setWrapAsset] = useState<FaceImageData | undefined>(
    undefined,
  );
  const [previewTab, setPreviewTab] = useState<"assembled" | "flat">("flat");
  const [selectedFace, setSelectedFace] = useState<FaceKey | "wrap" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const effectiveConfig: TuckboxConfig = useMemo(() => {
    if (useCardCount) {
      return {
        ...config,
        stackThickness: Math.max(1, cardCount * cardThickness),
      };
    }
    return config;
  }, [config, useCardCount, cardCount, cardThickness]);

  const layout = useMemo(
    () => computeLayout(effectiveConfig),
    [effectiveConfig],
  );

  // Pre-fill from a board game (image → all 6 face images). Title is intentionally
  // not pushed into the front label — users edit text themselves to keep it clean.
  // Runs once per imageUrl change.
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
            const faces: FaceKey[] = [
              "front",
              "back",
              "leftSide",
              "rightSide",
              "top",
              "bottom",
            ];
            let changed = false;
            for (const face of faces) {
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

          // Also prefill the "wrap around" slot — same image, single asset that
          // spans back→leftSide→front→rightSide if the user switches modes.
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
          // CORS blocked or fetch failed — leave the front face empty.
        }
      })();
    }

    return () => {
      cancelled = true;
    };
    // Only re-run when the image URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBoardgame?.imageUrl]);

  function updateConfig<K extends keyof TuckboxConfig>(
    key: K,
    value: TuckboxConfig[K],
  ) {
    setConfig((previousConfig) => ({ ...previousConfig, [key]: value }));
  }

  function setUnit(unit: Unit) {
    if (unit === config.unit) return;
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

  async function handleImageUpload(face: FaceKey, file: File | undefined) {
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
    setAssets((previousAssets) => {
      const current = previousAssets[face];
      if (!current) return previousAssets;
      return { ...previousAssets, [face]: { ...current, transform } };
    });
  }

  function updateLabel(face: FaceKey, patch: Partial<TextLabel>) {
    setLabels((previousLabels) => {
      const current = previousLabels[face] ?? makeDefaultLabel();
      return { ...previousLabels, [face]: { ...current, ...patch } };
    });
  }

  function moveLabel(face: FaceKey, anchorX: number, anchorY: number) {
    setLabels((previousLabels) => {
      const current = previousLabels[face] ?? makeDefaultLabel();
      return {
        ...previousLabels,
        [face]: { ...current, anchorX, anchorY },
      };
    });
  }

  async function handleWrapUpload(file: File | undefined) {
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
        labels,
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-4 lg:gap-6 max-w-7xl mx-auto p-4 sm:p-6 overflow-x-hidden">
      <div className="space-y-4 lg:space-y-6 order-2 lg:order-1">
        <header className="hidden lg:block">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tuckbox Generator
          </h1>
          <p className="text-sm text-muted mt-1">
            Enter your card dimensions, add artwork and text, then download a
            print-ready PDF.
          </p>
        </header>

        <Section title="Units & Paper" defaultOpen={false}>
          <Row label="Units">
            <SegmentedControl
              value={config.unit}
              onChange={(value) => setUnit(value as Unit)}
              options={[
                { value: "mm", label: "mm" },
                { value: "in", label: "in" },
              ]}
            />
          </Row>
          <Row label="Paper">
            <SegmentedControl
              value={config.paperSize}
              onChange={(value) =>
                updateConfig("paperSize", value as PaperSize)
              }
              options={[
                { value: "A4", label: "A4" },
                { value: "Letter", label: "Letter" },
              ]}
            />
          </Row>
          <Row label="Orientation">
            <SegmentedControl
              value={config.orientation}
              onChange={(value) =>
                updateConfig("orientation", value as Orientation)
              }
              options={[
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          </Row>
        </Section>

        <Section title="Card dimensions">
          <PairRow>
            <MiniField label={`Width (${unitLabel})`}>
              <NumberInput
                value={config.cardWidth}
                step={config.unit === "mm" ? 0.5 : 0.05}
                onChange={(value) => updateConfig("cardWidth", value)}
              />
            </MiniField>
            <MiniField label={`Height (${unitLabel})`}>
              <NumberInput
                value={config.cardHeight}
                step={config.unit === "mm" ? 0.5 : 0.05}
                onChange={(value) => updateConfig("cardHeight", value)}
              />
            </MiniField>
          </PairRow>
          <Row label="Stack input">
            <SegmentedControl
              value={useCardCount ? "count" : "thickness"}
              onChange={(value) => setUseCardCount(value === "count")}
              options={[
                { value: "count", label: "Count × thickness" },
                { value: "thickness", label: "Direct" },
              ]}
            />
          </Row>
          {useCardCount ? (
            <>
              <PairRow>
                <MiniField label="# of cards">
                  <NumberInput
                    value={cardCount}
                    step={1}
                    onChange={(value) =>
                      setCardCount(Math.max(1, Math.round(value)))
                    }
                  />
                </MiniField>
                <MiniField label={`Thickness/card (${unitLabel})`}>
                  <NumberInput
                    value={cardThickness}
                    step={config.unit === "mm" ? 0.01 : 0.001}
                    onChange={setCardThickness}
                  />
                </MiniField>
              </PairRow>
              <div className="text-xs text-muted -mt-1">
                Stack:{" "}
                <strong>
                  {(cardCount * cardThickness).toFixed(2)} {unitLabel}
                </strong>
              </div>
            </>
          ) : (
            <Row label={`Stack thickness (${unitLabel})`}>
              <NumberInput
                value={config.stackThickness}
                step={config.unit === "mm" ? 0.5 : 0.05}
                onChange={(value) => updateConfig("stackThickness", value)}
              />
            </Row>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted hover:text-foreground">
              Advanced (tolerance & material)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <Row label={`Tolerance (${unitLabel})`}>
                  <NumberInput
                    value={config.tolerance}
                    step={config.unit === "mm" ? 0.1 : 0.01}
                    onChange={(value) => updateConfig("tolerance", value)}
                  />
                </Row>
                <p className="text-[11px] text-muted mt-1 ml-[140px]">
                  Total slack added to each axis — half goes to each side of
                  the cards. Material thickness is compensated for separately.
                </p>
              </div>
              <div>
                <Row label={`Material thickness (${unitLabel})`}>
                  <NumberInput
                    value={config.materialThickness}
                    step={config.unit === "mm" ? 0.05 : 0.005}
                    onChange={(value) =>
                      updateConfig("materialThickness", value)
                    }
                  />
                </Row>
                <p className="text-[11px] text-muted mt-1 ml-[140px]">
                  Cardstock thickness. The box grows by 2× this on each axis
                  so the inside cavity equals card + tolerance.
                </p>
              </div>
            </div>
          </details>
        </Section>

        <Section title="Faces — images & text">
          <Row label="Image mode">
            <SegmentedControl
              value={imageMode}
              onChange={(value) =>
                setImageMode(value as "per-face" | "wrap")
              }
              options={[
                { value: "per-face", label: "Per face" },
                { value: "wrap", label: "Wrap around" },
              ]}
            />
          </Row>
          <div className="space-y-3">
            {imageMode === "wrap" && (
              <WrapEditor
                data={wrapAsset}
                aspect={wrapAspect}
                idealPx={wrapIdealPx}
                isSelected={selectedFace === "wrap"}
                onSelect={() => setSelectedFace("wrap")}
                onImage={handleWrapUpload}
                onTransform={updateWrapTransform}
              />
            )}
            {FACE_KEYS.filter((face) => {
              if (imageMode !== "wrap") return true;
              return face === "top" || face === "bottom";
            }).map((face) => (
              <FaceEditor
                key={face}
                face={face}
                displayName={FACE_LABELS_DISPLAY[face]}
                data={assets[face]}
                label={labels[face]}
                aspect={getFaceAspect(face)}
                idealPx={getFaceIdealPx(face)}
                isSelected={selectedFace === face}
                onSelect={() => setSelectedFace(face)}
                onImage={(file) => handleImageUpload(face, file)}
                onTransform={(transform) => updateTransform(face, transform)}
                onLabel={(patch) => updateLabel(face, patch)}
              />
            ))}
            {imageMode === "wrap" && (
              <div className="text-[11px] text-muted">
                Text labels for front/back/sides remain editable below in
                "Per face" mode. To add text in wrap mode, switch back, set
                your labels, then switch to "Wrap around".
              </div>
            )}
          </div>
        </Section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 self-start order-1 lg:order-2">
        <header className="lg:hidden">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Tuckbox Generator
          </h1>
        </header>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewTab("assembled")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              previewTab === "assembled"
                ? "bg-foreground text-bg"
                : "bg-surface-muted text-muted"
            }`}
          >
            Assembled box
          </button>
          <button
            type="button"
            onClick={() => setPreviewTab("flat")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              previewTab === "flat"
                ? "bg-foreground text-bg"
                : "bg-surface-muted text-muted"
            }`}
          >
            Flat net (print)
          </button>
        </div>

        <div className="h-[60vh] min-h-[420px]">
          {previewTab === "assembled" ? (
            <AssembledBoxPreview
              layout={layout}
              assets={assets}
              labels={labels}
              wrapAsset={imageMode === "wrap" ? wrapAsset : undefined}
            />
          ) : (
            <FlatNetPreview
              layout={layout}
              assets={assets}
              labels={labels}
              wrapAsset={imageMode === "wrap" ? wrapAsset : undefined}
              selectedFace={selectedFace}
              onSelectFace={setSelectedFace}
              onTransformChange={updateTransform}
              onWrapTransform={updateWrapTransform}
              onLabelMove={moveLabel}
            />
          )}
        </div>

        {layout.error && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50 text-amber-900 px-4 py-3 text-sm dark:bg-amber-950/30 dark:text-amber-200">
            {layout.error}
          </div>
        )}

        <div className="text-xs text-muted">
          Box:{" "}
          <strong>
            {layout.boxWidth.toFixed(1)} × {layout.boxHeight.toFixed(1)} ×{" "}
            {layout.boxDepth.toFixed(1)} {layout.unit}
          </strong>
          {" — "}
          Page:{" "}
          <strong>
            {layout.pageWidth.toFixed(1)} × {layout.pageHeight.toFixed(1)}{" "}
            {layout.unit}
          </strong>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!!layout.error || busy}
          className="w-full py-3 rounded-full bg-primary text-primary-fg font-semibold hover:bg-primary-hover transition-colors disabled:bg-surface-muted disabled:text-subtle disabled:cursor-not-allowed"
        >
          {busy ? "Generating…" : "Download PDF"}
        </button>

        <AssemblyInstructions />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-border-muted bg-surface/40 lg:border-0 lg:bg-transparent lg:rounded-none"
    >
      <summary className="flex items-center justify-between cursor-pointer list-none px-3 py-2 lg:px-0 lg:py-0">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {title}
        </h2>
        <span className="text-muted text-lg leading-none group-open:rotate-90 transition-transform">
          ›
        </span>
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-1 lg:px-0 lg:pb-0 lg:pt-3">
        {children}
      </div>
    </details>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-start sm:items-center gap-1.5 sm:gap-3 text-sm text-foreground">
      <span className="text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

function PairRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function MiniField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-foreground min-w-0">
      <span className="text-xs text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
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
  // Keep a local string so the user can clear the field while typing
  // (an empty input no longer snaps back to the last numeric value).
  const [text, setText] = useState<string>(() => String(value));
  const focusedRef = useRef(false);

  // Sync from parent when the value changes externally (e.g. unit conversion)
  // — but only when the input isn't focused, to avoid overwriting the user's
  // in-progress text.
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
          // Invalid / empty on blur — restore the last valid parent value.
          setText(String(value));
        } else if (parsed !== value) {
          onChange(parsed);
        }
      }}
      className="w-full rounded-md border border-border bg-surface text-foreground px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
    <div className="inline-flex rounded-full bg-surface-muted p-0.5 text-xs font-medium">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-3 py-1 rounded-full transition-colors ${
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

function WrapEditor({
  data,
  aspect,
  idealPx,
  isSelected,
  onSelect,
  onImage,
  onTransform,
}: {
  data: FaceImageData | undefined;
  aspect: number;
  idealPx: { width: number; height: number };
  isSelected: boolean;
  onSelect: () => void;
  onImage: (file: File | undefined) => void;
  onTransform: (transform: FaceImageTransform) => void;
}) {
  const lowResWarning =
    data &&
    (data.naturalWidth < idealPx.width * 0.6 ||
      data.naturalHeight < idealPx.height * 0.6);

  return (
    <details
      open
      onPointerDown={onSelect}
      className={`group rounded-lg border transition-colors ${
        isSelected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border"
      }`}
    >
      <summary className="flex items-center justify-between cursor-pointer list-none p-3">
        <span className="text-sm font-medium text-foreground">
          Body wrap (front + back + sides)
        </span>
        <div className="flex items-center gap-3">
          {data && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onImage(undefined);
              }}
              className="text-xs text-muted hover:text-red-600"
            >
              Remove
            </button>
          )}
          <span className="text-muted text-lg leading-none group-open:rotate-90 transition-transform">
            ›
          </span>
        </div>
      </summary>

      <div className="px-3 pb-3 space-y-3">
      <div className="text-[11px] text-muted">
        Recommended image:{" "}
        <strong>
          {idealPx.width} × {idealPx.height} px
        </strong>{" "}
        (300 DPI, wraps back → left → front → right)
        {data && (
          <>
            {" — "}
            <span
              className={
                lowResWarning ? "text-amber-600 dark:text-amber-400" : ""
              }
            >
              yours: {data.naturalWidth} × {data.naturalHeight} px
              {lowResWarning ? " (may look pixelated)" : ""}
            </span>
          </>
        )}
      </div>

      {!data && (
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded border border-dashed border-border flex items-center justify-center text-xs text-subtle">
            no img
          </div>
          <label className="flex-1 text-xs text-muted cursor-pointer">
            <span className="inline-block px-3 py-1.5 rounded-md bg-surface-muted hover:bg-border">
              Upload image
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => onImage(event.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <ImagePositioner
            data={data}
            frameAspect={aspect}
            onChange={onTransform}
          />
          <label className="text-xs text-muted cursor-pointer">
            <span className="underline hover:text-foreground">
              Replace image
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => onImage(event.target.files?.[0])}
            />
          </label>
        </div>
      )}
      </div>
    </details>
  );
}

function FaceEditor({
  face,
  displayName,
  data,
  label,
  aspect,
  idealPx,
  isSelected,
  onSelect,
  onImage,
  onTransform,
  onLabel,
}: {
  face: FaceKey;
  displayName: string;
  data: FaceImageData | undefined;
  label: TextLabel | undefined;
  aspect: number;
  idealPx: { width: number; height: number };
  isSelected: boolean;
  onSelect: () => void;
  onImage: (file: File | undefined) => void;
  onTransform: (transform: FaceImageTransform) => void;
  onLabel: (patch: Partial<TextLabel>) => void;
}) {
  void face;
  const effectiveLabel = label ?? makeDefaultLabel();

  const lowResWarning =
    data &&
    (data.naturalWidth < idealPx.width * 0.6 ||
      data.naturalHeight < idealPx.height * 0.6);

  return (
    <details
      open
      onPointerDown={onSelect}
      className={`group rounded-lg border transition-colors ${
        isSelected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border"
      }`}
    >
      <summary className="flex items-center justify-between cursor-pointer list-none p-3">
        <span className="text-sm font-medium text-foreground">
          {displayName}
        </span>
        <div className="flex items-center gap-3">
          {data && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onImage(undefined);
              }}
              className="text-xs text-muted hover:text-red-600"
            >
              Remove
            </button>
          )}
          <span className="text-muted text-lg leading-none group-open:rotate-90 transition-transform">
            ›
          </span>
        </div>
      </summary>

      <div className="px-3 pb-3 space-y-3">
      <div className="text-[11px] text-muted">
        Recommended image:{" "}
        <strong>
          {idealPx.width} × {idealPx.height} px
        </strong>{" "}
        (300 DPI)
        {data && (
          <>
            {" — "}
            <span
              className={
                lowResWarning ? "text-amber-600 dark:text-amber-400" : ""
              }
            >
              yours: {data.naturalWidth} × {data.naturalHeight} px
              {lowResWarning ? " (may look pixelated)" : ""}
            </span>
          </>
        )}
      </div>

      {!data && (
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded border border-dashed border-border flex items-center justify-center text-xs text-subtle">
            no img
          </div>
          <label className="flex-1 text-xs text-muted cursor-pointer">
            <span className="inline-block px-3 py-1.5 rounded-md bg-surface-muted hover:bg-border">
              Upload image
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => onImage(event.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <ImagePositioner
            data={data}
            frameAspect={aspect}
            onChange={onTransform}
          />
          <label className="text-xs text-muted cursor-pointer">
            <span className="underline hover:text-foreground">
              Replace image
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => onImage(event.target.files?.[0])}
            />
          </label>
        </div>
      )}

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Text label (optional)"
          value={effectiveLabel.text}
          onChange={(event) => onLabel({ text: event.target.value })}
          className="w-full rounded-md border border-border bg-surface text-foreground px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {effectiveLabel.text.trim() && (
          <>
            {(Math.abs(effectiveLabel.anchorX - 0.5) > 0.01 ||
              Math.abs(effectiveLabel.anchorY - 0.5) > 0.01) && (
              <div className="text-[11px] text-muted flex items-center gap-2">
                <span>
                  Position: {(effectiveLabel.anchorX * 100).toFixed(0)}%,{" "}
                  {(effectiveLabel.anchorY * 100).toFixed(0)}%
                </span>
                <button
                  type="button"
                  onClick={() => onLabel({ anchorX: 0.5, anchorY: 0.5 })}
                  className="underline hover:text-foreground"
                >
                  Center
                </button>
              </div>
            )}
            <div className="grid grid-cols-[1fr_1fr_72px_44px] gap-2 items-center text-xs">
              <select
                value={effectiveLabel.family}
                onChange={(event) =>
                  onLabel({ family: event.target.value as FontFamily })
                }
                className="rounded-md border border-border bg-surface text-foreground px-2 py-1"
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
              <select
                value={effectiveLabel.style}
                onChange={(event) =>
                  onLabel({ style: event.target.value as FontStyle })
                }
                className="rounded-md border border-border bg-surface text-foreground px-2 py-1"
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
                <option value="italic">Italic</option>
                <option value="bolditalic">Bold Italic</option>
              </select>
              <input
                type="number"
                value={effectiveLabel.sizePt}
                min={6}
                max={120}
                step={1}
                onChange={(event) => {
                  const parsed = parseFloat(event.target.value);
                  if (!Number.isNaN(parsed)) onLabel({ sizePt: parsed });
                }}
                className="rounded-md border border-border bg-surface text-foreground px-2 py-1"
                title="Font size (pt)"
              />
              <input
                type="color"
                value={effectiveLabel.color}
                onChange={(event) => onLabel({ color: event.target.value })}
                className="h-7 w-full rounded border border-border cursor-pointer"
                title="Color"
              />
            </div>
          </>
        )}
      </div>
      </div>
    </details>
  );
}
