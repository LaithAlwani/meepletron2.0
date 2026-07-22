import jsPDF from "jspdf";
import {
  computeImagePlacement,
  type FaceAssets,
  type FaceImageData,
  type FaceKey,
  type FaceLabels,
  type FontFamily,
  type FontStyle,
  type TextLabel,
  type TuckboxLayout,
} from "./types";

const FACE_KEYS: FaceKey[] = [
  "front",
  "back",
  "leftSide",
  "rightSide",
  "top",
  "bottom",
];

const FAMILY_MAP: Record<FontFamily, "helvetica" | "times" | "courier"> = {
  sans: "helvetica",
  serif: "times",
  mono: "courier",
};

const STYLE_MAP: Record<FontStyle, "normal" | "bold" | "italic" | "bolditalic"> = {
  normal: "normal",
  bold: "bold",
  italic: "italic",
  bolditalic: "bolditalic",
};

const PX_PER_MM = 6;

function inToMm(value: number) {
  return value * 25.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((character) => character + character)
          .join("")
      : cleaned;
  const numericValue = parseInt(full, 16);
  if (Number.isNaN(numericValue)) return [0, 0, 0];
  return [
    (numericValue >> 16) & 0xff,
    (numericValue >> 8) & 0xff,
    numericValue & 0xff,
  ];
}

async function cropImageToDataUrl(
  data: FaceImageData,
  panelWidthMm: number,
  panelHeightMm: number,
): Promise<string> {
  const canvasWidthPx = Math.max(1, Math.round(panelWidthMm * PX_PER_MM));
  const canvasHeightPx = Math.max(1, Math.round(panelHeightMm * PX_PER_MM));
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidthPx;
  canvas.height = canvasHeightPx;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get 2D canvas context");

  const image = new Image();
  image.src = data.url;
  await image.decode();

  const placement = computeImagePlacement(
    canvasWidthPx,
    canvasHeightPx,
    image.naturalWidth,
    image.naturalHeight,
    data.transform,
  );

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.save();
  context.translate(placement.centerX, placement.centerY);
  context.rotate((placement.rotation * Math.PI) / 180);
  context.drawImage(
    image,
    -placement.drawWidth / 2,
    -placement.drawHeight / 2,
    placement.drawWidth,
    placement.drawHeight,
  );
  context.restore();
  return canvas.toDataURL("image/png");
}

export async function renderTuckboxPdf(
  layout: TuckboxLayout,
  assets: FaceAssets,
  labels: FaceLabels,
  wrapAsset?: FaceImageData,
): Promise<Blob> {
  const toMm = layout.unit === "in" ? inToMm : (value: number) => value;

  const pageWidthMm = toMm(layout.pageWidth);
  const pageHeightMm = toMm(layout.pageHeight);

  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidthMm, pageHeightMm],
    orientation: pageWidthMm > pageHeightMm ? "landscape" : "portrait",
  });

  const wrapMode = !!wrapAsset;
  const bodyKeys: FaceKey[] = ["back", "leftSide", "front", "rightSide"];

  if (wrapMode && wrapAsset) {
    const backPanel = layout.panels.find((panel) => panel.key === "back");
    const rightPanel = layout.panels.find(
      (panel) => panel.key === "rightSide",
    );
    if (backPanel && rightPanel) {
      const bodyXMm = toMm(backPanel.positionX);
      const bodyYMm = toMm(backPanel.positionY);
      const bodyWidthMm = toMm(
        rightPanel.positionX + rightPanel.width - backPanel.positionX,
      );
      const bodyHeightMm = toMm(backPanel.height);
      try {
        const dataUrl = await cropImageToDataUrl(
          wrapAsset,
          bodyWidthMm,
          bodyHeightMm,
        );
        doc.addImage(
          dataUrl,
          "PNG",
          bodyXMm,
          bodyYMm,
          bodyWidthMm,
          bodyHeightMm,
          undefined,
          "FAST",
        );
      } catch {
        // skip invalid image
      }
    }
  }

  for (const key of FACE_KEYS) {
    if (wrapMode && bodyKeys.includes(key)) continue;
    const panel = layout.panels.find((p) => p.key === key);
    if (!panel) continue;
    const data = assets[key];
    if (!data) continue;
    const panelWidthMm = toMm(panel.width);
    const panelHeightMm = toMm(panel.height);
    try {
      const dataUrl = await cropImageToDataUrl(
        data,
        panelWidthMm,
        panelHeightMm,
      );
      doc.addImage(
        dataUrl,
        "PNG",
        toMm(panel.positionX),
        toMm(panel.positionY),
        panelWidthMm,
        panelHeightMm,
        undefined,
        "FAST",
      );
    } catch {
      // skip invalid image
    }
  }

  for (const key of FACE_KEYS) {
    const panel = layout.panels.find((p) => p.key === key);
    if (!panel) continue;
    const label = labels[key];
    if (!label || !label.text.trim()) continue;
    drawLabel(doc, label, panel, toMm);
  }

  doc.setLineWidth(0.2);
  doc.setDrawColor(120, 120, 120);
  doc.setLineDashPattern([2, 1.5], 0);
  for (const line of layout.foldLines) {
    doc.line(
      toMm(line.startX),
      toMm(line.startY),
      toMm(line.endX),
      toMm(line.endY),
    );
  }

  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  for (const line of layout.cutLines) {
    doc.line(
      toMm(line.startX),
      toMm(line.startY),
      toMm(line.endX),
      toMm(line.endY),
    );
  }

  return doc.output("blob");
}

function drawLabel(
  doc: jsPDF,
  label: TextLabel,
  panel: {
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    key: string;
  },
  toMm: (value: number) => number,
) {
  doc.setFont(FAMILY_MAP[label.family], STYLE_MAP[label.style]);
  doc.setFontSize(label.sizePt);
  const [red, green, blue] = hexToRgb(label.color || "#000000");
  doc.setTextColor(red, green, blue);

  const centerXMm = toMm(panel.positionX + panel.width * label.anchorX);
  const centerYMm = toMm(panel.positionY + panel.height * label.anchorY);

  const isSpine = panel.key === "leftSide" || panel.key === "rightSide";
  const angle = isSpine ? 90 : 0;

  doc.text(label.text, centerXMm, centerYMm, {
    align: "center",
    baseline: "middle",
    angle,
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
