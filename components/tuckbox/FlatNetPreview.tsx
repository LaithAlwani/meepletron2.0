"use client";

import { useRef } from "react";
import {
  computeImagePlacement,
  type FaceAssets,
  type FaceImageData,
  type FaceImageTransform,
  type FaceKey,
  type FaceLabels,
  type TextLabel,
  type TuckboxLayout,
} from "@/lib/tuckbox/types";

type Selection = FaceKey | "wrap" | null;
const BODY_FACE_KEYS: FaceKey[] = ["back", "leftSide", "front", "rightSide"];

const FACE_KEYS: FaceKey[] = [
  "front",
  "back",
  "leftSide",
  "rightSide",
  "top",
  "bottom",
];

const FAMILY_CSS = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, Menlo, monospace",
};

type Props = {
  layout: TuckboxLayout;
  assets: FaceAssets;
  labels: FaceLabels;
  wrapAsset?: FaceImageData;
  selectedFace: Selection;
  onSelectFace: (face: Selection) => void;
  onTransformChange: (face: FaceKey, transform: FaceImageTransform) => void;
  onWrapTransform: (transform: FaceImageTransform) => void;
  onLabelMove: (face: FaceKey, anchorX: number, anchorY: number) => void;
};

type ImageDragState = {
  face: FaceKey;
  startX: number;
  startY: number;
  baseAnchorX: number;
  baseAnchorY: number;
  rangeX: number;
  rangeY: number;
};

type LabelDragState = {
  face: FaceKey;
  startX: number;
  startY: number;
  baseAnchorX: number;
  baseAnchorY: number;
  panelWidth: number;
  panelHeight: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function FlatNetPreview({
  layout,
  assets,
  labels,
  wrapAsset,
  selectedFace,
  onSelectFace,
  onTransformChange,
  onWrapTransform,
  onLabelMove,
}: Props) {
  const wrapMode = !!wrapAsset;
  const { pageWidth, pageHeight, panels, foldLines, cutLines } = layout;
  const unitToPt = layout.unit === "mm" ? 2.83465 : 72;

  // Line styles mirror the PDF renderer (lib/tuckbox/pdf.ts) so the on-screen
  // preview matches the printed output exactly. Values are in the layout's unit
  // (mm or in) — the SVG viewBox is in those same units, so a raw value of
  // 0.35 renders as 0.35mm/in.
  const isMm = layout.unit === "mm";
  const cutStroke = isMm ? 0.35 : 0.35 / 25.4;
  const foldStroke = isMm ? 0.2 : 0.2 / 25.4;
  const foldDashOn = isMm ? 2 : 2 / 25.4;
  const foldDashOff = isMm ? 1.5 : 1.5 / 25.4;
  const imageDragRef = useRef<ImageDragState | null>(null);
  const labelDragRef = useRef<LabelDragState | null>(null);

  const backPanel = panels.find((panel) => panel.key === "back");
  const rightPanel = panels.find((panel) => panel.key === "rightSide");
  const bodyRect =
    backPanel && rightPanel
      ? {
          positionX: backPanel.positionX,
          positionY: backPanel.positionY,
          width: rightPanel.positionX + rightPanel.width - backPanel.positionX,
          height: backPanel.height,
        }
      : null;

  const wrapPlacement =
    wrapMode && wrapAsset && bodyRect
      ? computeImagePlacement(
          bodyRect.width,
          bodyRect.height,
          wrapAsset.naturalWidth,
          wrapAsset.naturalHeight,
          wrapAsset.transform,
        )
      : null;

  function svgPointFromEvent(
    event: React.PointerEvent,
    svg: SVGSVGElement,
  ): { x: number; y: number } | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inverse = ctm.inverse();
    const transformedPoint = new DOMPoint(
      event.clientX,
      event.clientY,
    ).matrixTransform(inverse);
    return { x: transformedPoint.x, y: transformedPoint.y };
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-muted rounded-lg p-4">
      <svg
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        className="max-w-full max-h-full touch-none"
        style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelectFace(null);
        }}
      >
        <defs>
          {FACE_KEYS.map((key) => {
            const panel = panels.find((p) => p.key === key);
            if (!panel) return null;
            return (
              <clipPath key={`clip-${key}`} id={`clip-${key}`}>
                <rect
                  x={panel.positionX}
                  y={panel.positionY}
                  width={panel.width}
                  height={panel.height}
                />
              </clipPath>
            );
          })}
          {bodyRect && (
            <clipPath id="clip-wrap">
              <rect
                x={bodyRect.positionX}
                y={bodyRect.positionY}
                width={bodyRect.width}
                height={bodyRect.height}
              />
            </clipPath>
          )}
        </defs>

        <rect
          x={0}
          y={0}
          width={pageWidth}
          height={pageHeight}
          fill="white"
          stroke="rgb(var(--color-primary) / 0)"
          strokeWidth={pageWidth * 0.001}
        />

        {FACE_KEYS.map((key) => {
          const panel = panels.find((p) => p.key === key);
          const isBody = BODY_FACE_KEYS.includes(key);
          if (wrapMode && isBody) return null;
          const data = assets[key];
          if (!panel) return null;

          const placement = data
            ? computeImagePlacement(
                panel.width,
                panel.height,
                data.naturalWidth,
                data.naturalHeight,
                data.transform,
              )
            : null;

          const isSelected = selectedFace === key;

          return (
            <g
              key={`face-${key}`}
              clipPath={`url(#clip-${key})`}
              style={{ cursor: data ? "grab" : "pointer", touchAction: "none" }}
              onPointerDown={(event) => {
                const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
                if (!svg) return;
                onSelectFace(key);
                if (!data || !placement) return;
                const point = svgPointFromEvent(event, svg);
                if (!point) return;
                (event.currentTarget as Element).setPointerCapture?.(
                  event.pointerId,
                );
                imageDragRef.current = {
                  face: key,
                  startX: point.x,
                  startY: point.y,
                  baseAnchorX: data.transform.anchorX,
                  baseAnchorY: data.transform.anchorY,
                  rangeX: panel.width - placement.width,
                  rangeY: panel.height - placement.height,
                };
              }}
              onPointerMove={(event) => {
                const dragState = imageDragRef.current;
                if (!dragState || dragState.face !== key || !data) return;
                const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
                if (!svg) return;
                const point = svgPointFromEvent(event, svg);
                if (!point) return;
                const deltaX = point.x - dragState.startX;
                const deltaY = point.y - dragState.startY;
                const nextAnchorX =
                  Math.abs(dragState.rangeX) < 0.001
                    ? dragState.baseAnchorX
                    : clamp01(dragState.baseAnchorX + deltaX / dragState.rangeX);
                const nextAnchorY =
                  Math.abs(dragState.rangeY) < 0.001
                    ? dragState.baseAnchorY
                    : clamp01(dragState.baseAnchorY + deltaY / dragState.rangeY);
                onTransformChange(key, {
                  ...data.transform,
                  anchorX: nextAnchorX,
                  anchorY: nextAnchorY,
                });
              }}
              onPointerUp={() => {
                imageDragRef.current = null;
              }}
              onPointerCancel={() => {
                imageDragRef.current = null;
              }}
            >
              <rect
                x={panel.positionX}
                y={panel.positionY}
                width={panel.width}
                height={panel.height}
                fill="transparent"
              />
              {data && placement && (
                <g
                  transform={`translate(${panel.positionX + placement.centerX} ${panel.positionY + placement.centerY}) rotate(${placement.rotation})`}
                  style={{ pointerEvents: "none" }}
                >
                  <image
                    href={data.url}
                    x={-placement.drawWidth / 2}
                    y={-placement.drawHeight / 2}
                    width={placement.drawWidth}
                    height={placement.drawHeight}
                    preserveAspectRatio="none"
                  />
                </g>
              )}
              {!data && (
                <text
                  x={panel.positionX + panel.width / 2}
                  y={panel.positionY + panel.height / 2}
                  fontSize={Math.min(panel.width, panel.height) * 0.08}
                  fill="rgb(141 147 157)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  opacity={0.6}
                  style={{
                    pointerEvents: "none",
                    fontFamily: "system-ui",
                  }}
                >
                  {panel.key}
                </text>
              )}
              {isSelected && (
                <rect
                  x={panel.positionX}
                  y={panel.positionY}
                  width={panel.width}
                  height={panel.height}
                  fill="none"
                  stroke="rgb(var(--color-primary))"
                  strokeWidth={pageWidth * 0.002}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </g>
          );
        })}

        {wrapMode && bodyRect && (
          <g
            clipPath="url(#clip-wrap)"
            style={{
              cursor: wrapAsset ? "grab" : "pointer",
              touchAction: "none",
            }}
            onPointerDown={(event) => {
              const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
              if (!svg) return;
              onSelectFace("wrap");
              if (!wrapAsset || !wrapPlacement) return;
              const point = svgPointFromEvent(event, svg);
              if (!point) return;
              (event.currentTarget as Element).setPointerCapture?.(
                event.pointerId,
              );
              imageDragRef.current = {
                face: "front",
                startX: point.x,
                startY: point.y,
                baseAnchorX: wrapAsset.transform.anchorX,
                baseAnchorY: wrapAsset.transform.anchorY,
                rangeX: bodyRect.width - wrapPlacement.width,
                rangeY: bodyRect.height - wrapPlacement.height,
              };
            }}
            onPointerMove={(event) => {
              const dragState = imageDragRef.current;
              if (!dragState || !wrapAsset) return;
              const svg = (event.currentTarget as SVGGElement).ownerSVGElement;
              if (!svg) return;
              const point = svgPointFromEvent(event, svg);
              if (!point) return;
              const deltaX = point.x - dragState.startX;
              const deltaY = point.y - dragState.startY;
              const nextAnchorX =
                Math.abs(dragState.rangeX) < 0.001
                  ? dragState.baseAnchorX
                  : clamp01(dragState.baseAnchorX + deltaX / dragState.rangeX);
              const nextAnchorY =
                Math.abs(dragState.rangeY) < 0.001
                  ? dragState.baseAnchorY
                  : clamp01(dragState.baseAnchorY + deltaY / dragState.rangeY);
              onWrapTransform({
                ...wrapAsset.transform,
                anchorX: nextAnchorX,
                anchorY: nextAnchorY,
              });
            }}
            onPointerUp={() => {
              imageDragRef.current = null;
            }}
            onPointerCancel={() => {
              imageDragRef.current = null;
            }}
          >
            <rect
              x={bodyRect.positionX}
              y={bodyRect.positionY}
              width={bodyRect.width}
              height={bodyRect.height}
              fill="transparent"
            />
            {wrapAsset && wrapPlacement && (
              <g
                transform={`translate(${bodyRect.positionX + wrapPlacement.centerX} ${bodyRect.positionY + wrapPlacement.centerY}) rotate(${wrapPlacement.rotation})`}
                style={{ pointerEvents: "none" }}
              >
                <image
                  href={wrapAsset.url}
                  x={-wrapPlacement.drawWidth / 2}
                  y={-wrapPlacement.drawHeight / 2}
                  width={wrapPlacement.drawWidth}
                  height={wrapPlacement.drawHeight}
                  preserveAspectRatio="none"
                />
              </g>
            )}
            {!wrapAsset && (
              <text
                x={bodyRect.positionX + bodyRect.width / 2}
                y={bodyRect.positionY + bodyRect.height / 2}
                fontSize={bodyRect.height * 0.1}
                fill="rgb(141 147 157)"
                textAnchor="middle"
                dominantBaseline="middle"
                opacity={0.6}
                style={{
                  pointerEvents: "none",
                  fontFamily: "system-ui",
                }}
              >
                wrap (back · left · front · right)
              </text>
            )}
            {selectedFace === "wrap" && (
              <rect
                x={bodyRect.positionX}
                y={bodyRect.positionY}
                width={bodyRect.width}
                height={bodyRect.height}
                fill="none"
                stroke="rgb(var(--color-primary))"
                strokeWidth={pageWidth * 0.002}
                style={{ pointerEvents: "none" }}
              />
            )}
          </g>
        )}

        {FACE_KEYS.map((key) => {
          const panel = panels.find((p) => p.key === key);
          const label: TextLabel | undefined = labels[key];
          if (!panel || !label || !label.text.trim()) return null;
          const isSpine = key === "leftSide" || key === "rightSide";
          const labelCenterX = panel.positionX + panel.width * label.anchorX;
          const labelCenterY = panel.positionY + panel.height * label.anchorY;
          const sizeInUnits = label.sizePt / unitToPt;
          return (
            <text
              key={`label-${key}`}
              x={labelCenterX}
              y={labelCenterY}
              fontSize={sizeInUnits}
              fill={label.color || "#000"}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={
                isSpine
                  ? `rotate(90 ${labelCenterX} ${labelCenterY})`
                  : undefined
              }
              style={{
                fontFamily: FAMILY_CSS[label.family],
                fontWeight:
                  label.style === "bold" || label.style === "bolditalic"
                    ? 700
                    : 400,
                fontStyle:
                  label.style === "italic" || label.style === "bolditalic"
                    ? "italic"
                    : "normal",
                cursor: "move",
                touchAction: "none",
                userSelect: "none",
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                const svg = (event.currentTarget as SVGTextElement)
                  .ownerSVGElement;
                if (!svg) return;
                onSelectFace(key);
                const point = svgPointFromEvent(event, svg);
                if (!point) return;
                (event.currentTarget as Element).setPointerCapture?.(
                  event.pointerId,
                );
                labelDragRef.current = {
                  face: key,
                  startX: point.x,
                  startY: point.y,
                  baseAnchorX: label.anchorX,
                  baseAnchorY: label.anchorY,
                  panelWidth: panel.width,
                  panelHeight: panel.height,
                };
              }}
              onPointerMove={(event) => {
                const dragState = labelDragRef.current;
                if (!dragState || dragState.face !== key) return;
                const svg = (event.currentTarget as SVGTextElement)
                  .ownerSVGElement;
                if (!svg) return;
                const point = svgPointFromEvent(event, svg);
                if (!point) return;
                const deltaX = point.x - dragState.startX;
                const deltaY = point.y - dragState.startY;
                const nextAnchorX = clamp01(
                  dragState.baseAnchorX + deltaX / dragState.panelWidth,
                );
                const nextAnchorY = clamp01(
                  dragState.baseAnchorY + deltaY / dragState.panelHeight,
                );
                onLabelMove(key, nextAnchorX, nextAnchorY);
              }}
              onPointerUp={() => {
                labelDragRef.current = null;
              }}
              onPointerCancel={() => {
                labelDragRef.current = null;
              }}
            >
              {label.text}
            </text>
          );
        })}

        {foldLines.map((line, index) => (
          <line
            key={`fold-${index}`}
            x1={line.startX}
            y1={line.startY}
            x2={line.endX}
            y2={line.endY}
            stroke="rgb(141 147 157)"
            strokeWidth={foldStroke}
            strokeDasharray={`${foldDashOn} ${foldDashOff}`}
            style={{ pointerEvents: "none" }}
          />
        ))}

        {cutLines.map((line, index) => (
          <line
            key={`cut-${index}`}
            x1={line.startX}
            y1={line.startY}
            x2={line.endX}
            y2={line.endY}
            stroke="rgb(17 24 39)"
            strokeWidth={cutStroke}
            style={{ pointerEvents: "none" }}
          />
        ))}
      </svg>
    </div>
  );
}
