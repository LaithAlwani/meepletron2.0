export type Unit = "mm" | "in";
export type PaperSize = "A4" | "Letter";
export type Orientation = "portrait" | "landscape";

export type FaceKey =
  | "front"
  | "back"
  | "leftSide"
  | "rightSide"
  | "top"
  | "bottom";

export type FontFamily = "sans" | "serif" | "mono";
export type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

export type TextLabel = {
  text: string;
  family: FontFamily;
  style: FontStyle;
  sizePt: number;
  color: string;
  anchorX: number;
  anchorY: number;
};

export const DEFAULT_LABEL_POSITION = { anchorX: 0.5, anchorY: 0.5 };

export type TuckboxConfig = {
  unit: Unit;
  cardWidth: number;
  cardHeight: number;
  stackThickness: number;
  tolerance: number;
  materialThickness: number;
  paperSize: PaperSize;
  orientation: Orientation;
};

export type ImageRotation = 0 | 90 | 180 | 270;

export type FaceImageTransform = {
  zoom: number;
  anchorX: number;
  anchorY: number;
  rotation: ImageRotation;
};

export type FaceImageData = {
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  transform: FaceImageTransform;
};

export type FaceAssets = Partial<Record<FaceKey, FaceImageData>>;
export type FaceLabels = Partial<Record<FaceKey, TextLabel>>;

export const DEFAULT_IMAGE_TRANSFORM: FaceImageTransform = {
  zoom: 1,
  anchorX: 0.5,
  anchorY: 0.5,
  rotation: 0,
};

export type ImagePlacement = {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  drawWidth: number;
  drawHeight: number;
  rotation: ImageRotation;
};

export const PRINT_DPI = 300;

export function idealPixelsForPanel(
  panelWidth: number,
  panelHeight: number,
  unit: Unit,
): { width: number; height: number } {
  const toInches = (value: number) => (unit === "in" ? value : value / 25.4);
  return {
    width: Math.round(toInches(panelWidth) * PRINT_DPI),
    height: Math.round(toInches(panelHeight) * PRINT_DPI),
  };
}

export function computeImagePlacement(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
  transform: FaceImageTransform,
): ImagePlacement {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return {
      positionX: 0,
      positionY: 0,
      width: frameWidth,
      height: frameHeight,
      centerX: frameWidth / 2,
      centerY: frameHeight / 2,
      drawWidth: frameWidth,
      drawHeight: frameHeight,
      rotation: transform.rotation,
    };
  }
  const rotation = transform.rotation;
  const axesSwap = rotation === 90 || rotation === 270;
  const rotatedWidth = axesSwap ? imageHeight : imageWidth;
  const rotatedHeight = axesSwap ? imageWidth : imageHeight;
  const coverScale = Math.max(
    frameWidth / rotatedWidth,
    frameHeight / rotatedHeight,
  );
  const displayScale = coverScale * Math.max(0.1, transform.zoom);
  const width = rotatedWidth * displayScale;
  const height = rotatedHeight * displayScale;
  // Anchor mapping: the point (anchorX, anchorY) of the rotated image's
  // bounding box aligns with the same relative point of the frame.
  const positionX = (frameWidth - width) * transform.anchorX;
  const positionY = (frameHeight - height) * transform.anchorY;
  return {
    positionX,
    positionY,
    width,
    height,
    centerX: positionX + width / 2,
    centerY: positionY + height / 2,
    drawWidth: imageWidth * displayScale,
    drawHeight: imageHeight * displayScale,
    rotation,
  };
}

export type PanelKey =
  | FaceKey
  | "topTuck"
  | "topDustLeft"
  | "topDustRight"
  | "bottomDustLeft"
  | "bottomDustRight"
  | "glueTab";

export type Panel = {
  key: PanelKey;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotationDeg: 0 | 90 | 180 | 270;
};

export type Line = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type TuckboxLayout = {
  unit: Unit;
  pageWidth: number;
  pageHeight: number;
  boxWidth: number;
  boxHeight: number;
  boxDepth: number;
  panels: Panel[];
  foldLines: Line[];
  cutLines: Line[];
  netBounds: {
    positionX: number;
    positionY: number;
    width: number;
    height: number;
  };
  error?: string;
};
