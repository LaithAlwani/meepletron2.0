import type {
  Line,
  Panel,
  PanelKey,
  TuckboxConfig,
  TuckboxLayout,
} from "./types";

const PAPER_SIZES = {
  A4: { mm: { w: 210, h: 297 }, in: { w: 8.27, h: 11.69 } },
  Letter: { mm: { w: 215.9, h: 279.4 }, in: { w: 8.5, h: 11 } },
} as const;

const GLUE_TAB_WIDTH_MM = 10;
const GLUE_TAB_WIDTH_IN = 0.4;
const PAGE_MARGIN_MM = 8;
const PAGE_MARGIN_IN = 0.32;

function paperDims(config: TuckboxConfig, swapAxes: boolean) {
  const base = PAPER_SIZES[config.paperSize][config.unit];
  return swapAxes ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
}

export function computeLayout(config: TuckboxConfig): TuckboxLayout {
  const glueTabWidth =
    config.unit === "mm" ? GLUE_TAB_WIDTH_MM : GLUE_TAB_WIDTH_IN;
  const margin = config.unit === "mm" ? PAGE_MARGIN_MM : PAGE_MARGIN_IN;

  const wallThickness = Math.max(0, config.materialThickness);
  const outerWidth = Math.max(
    0,
    config.cardWidth + config.tolerance + 2 * wallThickness,
  );
  const outerHeight = Math.max(
    0,
    config.cardHeight + config.tolerance + 2 * wallThickness,
  );
  const outerDepth = Math.max(
    0,
    config.stackThickness + config.tolerance + 2 * wallThickness,
  );

  const tuckFlapHeight = outerDepth * 0.95;

  // Slack scales with both tolerance and material thickness so the flap
  // mechanically clears the inner cavity. ~0.5mm minimum so the step-in
  // is visible in the preview even at small tolerances.
  const flapClearance = Math.max(
    config.unit === "mm" ? 0.5 : 0.02,
    config.tolerance * 0.3 + 2 * wallThickness * 0.3,
  );
  const tuckFlapInnerWidthRaw = outerWidth - 2 * wallThickness - flapClearance;
  const dustFlapWidthRaw = outerDepth - 2 * wallThickness - flapClearance;
  const tuckFlapInnerWidth = Math.max(0, tuckFlapInnerWidthRaw);
  const dustFlapWidth = Math.max(0, dustFlapWidthRaw);
  const tuckFlapXOffset = (outerWidth - tuckFlapInnerWidth) / 2;
  const dustFlapXOffset = (outerDepth - dustFlapWidth) / 2;
  // Dust-flap taper: dust flaps narrow toward their free edge so they slide
  // into the box cavity smoothly during assembly. ~3mm per side (in the
  // layout's unit), capped so very small flaps can never invert.
  const dustFlapTaperBase = config.unit === "mm" ? 3 : 3 / 25.4;
  const dustFlapTaper = Math.max(
    0,
    Math.min(dustFlapTaperBase, dustFlapWidth * 0.15),
  );

  const netWidth = glueTabWidth + 2 * outerWidth + 2 * outerDepth;
  const netHeight = tuckFlapHeight + outerDepth + outerHeight + outerDepth;

  const requestedSwap = config.orientation === "landscape";
  const tryOrder: [boolean, boolean] = [requestedSwap, !requestedSwap];

  let chosen: { w: number; h: number } | null = null;
  for (const swapAxes of tryOrder) {
    const paper = paperDims(config, swapAxes);
    if (netWidth + 2 * margin <= paper.w && netHeight + 2 * margin <= paper.h) {
      chosen = paper;
      break;
    }
  }

  const fallback = paperDims(config, requestedSwap);
  const pageWidth = chosen?.w ?? fallback.w;
  const pageHeight = chosen?.h ?? fallback.h;

  const pageOffsetX = (pageWidth - netWidth) / 2;
  const pageOffsetY = (pageHeight - netHeight) / 2;

  const glueTabX = 0;
  const backPanelX = glueTabWidth;
  const leftSidePanelX = glueTabWidth + outerWidth;
  const frontPanelX = glueTabWidth + outerWidth + outerDepth;
  const rightSidePanelX = glueTabWidth + outerWidth + outerDepth + outerWidth;
  const rightSidePanelEndX = glueTabWidth + 2 * outerWidth + 2 * outerDepth;

  const leftDustFlapX = leftSidePanelX + dustFlapXOffset;
  const leftDustFlapEndX = leftDustFlapX + dustFlapWidth;
  const rightDustFlapX = rightSidePanelX + dustFlapXOffset;
  const rightDustFlapEndX = rightDustFlapX + dustFlapWidth;
  const tuckFlapStartX = frontPanelX + tuckFlapXOffset;
  const tuckFlapEndX = tuckFlapStartX + tuckFlapInnerWidth;

  const tuckTopY = 0;
  const topRowY = tuckFlapHeight;
  const bodyTopY = tuckFlapHeight + outerDepth;
  const bottomRowY = tuckFlapHeight + outerDepth + outerHeight;
  const bottomEndY = tuckFlapHeight + outerDepth + outerHeight + outerDepth;

  const rawPanels: Panel[] = [
    {
      key: "glueTab",
      positionX: glueTabX,
      positionY: bodyTopY,
      width: glueTabWidth,
      height: outerHeight,
      rotationDeg: 0,
    },
    {
      key: "back",
      positionX: backPanelX,
      positionY: bodyTopY,
      width: outerWidth,
      height: outerHeight,
      rotationDeg: 0,
    },
    {
      key: "leftSide",
      positionX: leftSidePanelX,
      positionY: bodyTopY,
      width: outerDepth,
      height: outerHeight,
      rotationDeg: 0,
    },
    {
      key: "front",
      positionX: frontPanelX,
      positionY: bodyTopY,
      width: outerWidth,
      height: outerHeight,
      rotationDeg: 0,
    },
    {
      key: "rightSide",
      positionX: rightSidePanelX,
      positionY: bodyTopY,
      width: outerDepth,
      height: outerHeight,
      rotationDeg: 0,
    },
    {
      key: "topDustLeft",
      positionX: leftDustFlapX,
      positionY: topRowY,
      width: dustFlapWidth,
      height: outerDepth,
      rotationDeg: 0,
    },
    {
      key: "top",
      positionX: frontPanelX,
      positionY: topRowY,
      width: outerWidth,
      height: outerDepth,
      rotationDeg: 0,
    },
    {
      key: "topDustRight",
      positionX: rightDustFlapX,
      positionY: topRowY,
      width: dustFlapWidth,
      height: outerDepth,
      rotationDeg: 0,
    },
    {
      key: "topTuck",
      positionX: tuckFlapStartX,
      positionY: tuckTopY,
      width: tuckFlapInnerWidth,
      height: tuckFlapHeight,
      rotationDeg: 0,
    },
    {
      key: "bottomDustLeft",
      positionX: leftDustFlapX,
      positionY: bottomRowY,
      width: dustFlapWidth,
      height: outerDepth,
      rotationDeg: 0,
    },
    {
      key: "bottom",
      positionX: frontPanelX,
      positionY: bottomRowY,
      width: outerWidth,
      height: outerDepth,
      rotationDeg: 0,
    },
    {
      key: "bottomDustRight",
      positionX: rightDustFlapX,
      positionY: bottomRowY,
      width: dustFlapWidth,
      height: outerDepth,
      rotationDeg: 0,
    },
  ];

  const panels: Panel[] = rawPanels.map((panel) => ({
    ...panel,
    positionX: panel.positionX + pageOffsetX,
    positionY: panel.positionY + pageOffsetY,
  }));

  const makeLine = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): Line => ({
    startX: startX + pageOffsetX,
    startY: startY + pageOffsetY,
    endX: endX + pageOffsetX,
    endY: endY + pageOffsetY,
  });

  const cutLines: Line[] = [
    // Top edge of body row from glue tab to start of left dust flap
    makeLine(glueTabX, bodyTopY, leftDustFlapX, bodyTopY),
    // Left dust flap silhouette (tapered: narrower at free edge)
    makeLine(leftDustFlapX, bodyTopY, leftDustFlapX + dustFlapTaper, topRowY),
    makeLine(leftDustFlapX + dustFlapTaper, topRowY, leftDustFlapEndX - dustFlapTaper, topRowY),
    makeLine(leftDustFlapEndX - dustFlapTaper, topRowY, leftDustFlapEndX, bodyTopY),
    // Gap between left dust flap and top panel
    makeLine(leftDustFlapEndX, bodyTopY, frontPanelX, bodyTopY),
    // Top panel + tuck flap silhouette
    makeLine(frontPanelX, bodyTopY, frontPanelX, topRowY),
    makeLine(frontPanelX, topRowY, tuckFlapStartX, topRowY),
    makeLine(tuckFlapStartX, topRowY, tuckFlapStartX, tuckTopY),
    makeLine(tuckFlapStartX, tuckTopY, tuckFlapEndX, tuckTopY),
    makeLine(tuckFlapEndX, tuckTopY, tuckFlapEndX, topRowY),
    makeLine(tuckFlapEndX, topRowY, frontPanelX + outerWidth, topRowY),
    makeLine(frontPanelX + outerWidth, topRowY, frontPanelX + outerWidth, bodyTopY),
    // Gap between top panel and right dust flap
    makeLine(frontPanelX + outerWidth, bodyTopY, rightDustFlapX, bodyTopY),
    // Right dust flap silhouette (tapered: narrower at free edge)
    makeLine(rightDustFlapX, bodyTopY, rightDustFlapX + dustFlapTaper, topRowY),
    makeLine(rightDustFlapX + dustFlapTaper, topRowY, rightDustFlapEndX - dustFlapTaper, topRowY),
    makeLine(rightDustFlapEndX - dustFlapTaper, topRowY, rightDustFlapEndX, bodyTopY),
    // Gap to right edge of body
    makeLine(rightDustFlapEndX, bodyTopY, rightSidePanelEndX, bodyTopY),
    // Right edge of body
    makeLine(rightSidePanelEndX, bodyTopY, rightSidePanelEndX, bottomRowY),
    // Mirror: bottom edge of body row to start of right bottom dust flap
    makeLine(rightSidePanelEndX, bottomRowY, rightDustFlapEndX, bottomRowY),
    makeLine(rightDustFlapEndX, bottomRowY, rightDustFlapEndX - dustFlapTaper, bottomEndY),
    makeLine(rightDustFlapEndX - dustFlapTaper, bottomEndY, rightDustFlapX + dustFlapTaper, bottomEndY),
    makeLine(rightDustFlapX + dustFlapTaper, bottomEndY, rightDustFlapX, bottomRowY),
    // (continues to gap line between right dust flap fold and front panel)
    makeLine(rightDustFlapX, bottomRowY, frontPanelX + outerWidth, bottomRowY),
    makeLine(
      frontPanelX + outerWidth,
      bottomRowY,
      frontPanelX + outerWidth,
      bottomEndY,
    ),
    makeLine(frontPanelX + outerWidth, bottomEndY, frontPanelX, bottomEndY),
    makeLine(frontPanelX, bottomEndY, frontPanelX, bottomRowY),
    makeLine(frontPanelX, bottomRowY, leftDustFlapEndX, bottomRowY),
    makeLine(leftDustFlapEndX, bottomRowY, leftDustFlapEndX - dustFlapTaper, bottomEndY),
    makeLine(leftDustFlapEndX - dustFlapTaper, bottomEndY, leftDustFlapX + dustFlapTaper, bottomEndY),
    makeLine(leftDustFlapX + dustFlapTaper, bottomEndY, leftDustFlapX, bottomRowY),
    makeLine(leftDustFlapX, bottomRowY, glueTabX, bottomRowY),
    // Left edge of glue tab closing the silhouette
    makeLine(glueTabX, bottomRowY, glueTabX, bodyTopY),
  ];

  const foldLines: Line[] = [
    // Vertical body-row folds between panels
    makeLine(backPanelX, bodyTopY, backPanelX, bottomRowY),
    makeLine(leftSidePanelX, bodyTopY, leftSidePanelX, bottomRowY),
    makeLine(frontPanelX, bodyTopY, frontPanelX, bottomRowY),
    makeLine(rightSidePanelX, bodyTopY, rightSidePanelX, bottomRowY),
    // Top folds: dust flaps to side panels (only over the dust flap's width)
    makeLine(leftDustFlapX, bodyTopY, leftDustFlapEndX, bodyTopY),
    makeLine(rightDustFlapX, bodyTopY, rightDustFlapEndX, bodyTopY),
    // Top fold: front panel to top panel (full width of the top panel)
    makeLine(frontPanelX, bodyTopY, frontPanelX + outerWidth, bodyTopY),
    // Top fold: top panel to tuck flap (only over the tuck flap's width)
    makeLine(tuckFlapStartX, topRowY, tuckFlapEndX, topRowY),
    // Bottom folds: dust flaps to side panels
    makeLine(leftDustFlapX, bottomRowY, leftDustFlapEndX, bottomRowY),
    makeLine(rightDustFlapX, bottomRowY, rightDustFlapEndX, bottomRowY),
    // Bottom fold: front panel to bottom panel
    makeLine(frontPanelX, bottomRowY, frontPanelX + outerWidth, bottomRowY),
  ];

  let error: string | undefined;
  if (!chosen) {
    error =
      "Box doesn't fit on the selected paper. Try a larger paper size, landscape orientation, or smaller card dimensions.";
  } else if (tuckFlapInnerWidthRaw <= 0 || dustFlapWidthRaw <= 0) {
    error =
      "Material thickness is too large for these card dimensions — the tuck flap or dust flaps collapse. Reduce material thickness or increase tolerance.";
  }

  return {
    unit: config.unit,
    pageWidth,
    pageHeight,
    boxWidth: outerWidth,
    boxHeight: outerHeight,
    boxDepth: outerDepth,
    panels,
    foldLines,
    cutLines,
    netBounds: {
      positionX: pageOffsetX,
      positionY: pageOffsetY,
      width: netWidth,
      height: netHeight,
    },
    error,
  };
}

export function getPanel(
  layout: TuckboxLayout,
  key: PanelKey,
): Panel | undefined {
  return layout.panels.find((panel) => panel.key === key);
}
