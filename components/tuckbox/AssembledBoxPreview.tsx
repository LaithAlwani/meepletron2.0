"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeImagePlacement,
  type FaceAssets,
  type FaceImageData,
  type FaceKey,
  type FaceLabels,
  type TuckboxLayout,
} from "@/lib/tuckbox/types";

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
};

type FaceDef = {
  key: FaceKey;
  width: number;
  height: number;
  transform: string;
  rotateContent?: number;
};

// Each body face's x-offset in the wrap rect (in box units),
// matching the net order: back → leftSide → front → rightSide.
function wrapOffsetForFace(
  faceKey: FaceKey,
  boxWidth: number,
  boxDepth: number,
): number | null {
  switch (faceKey) {
    case "back":
      return 0;
    case "leftSide":
      return boxWidth;
    case "front":
      return boxWidth + boxDepth;
    case "rightSide":
      return 2 * boxWidth + boxDepth;
    default:
      return null;
  }
}

export function AssembledBoxPreview({
  layout,
  assets,
  labels,
  wrapAsset,
}: Props) {
  const { boxWidth, boxHeight, boxDepth } = layout;
  const longest = Math.max(boxWidth, boxHeight, boxDepth) || 1;
  const scale = 240 / longest;

  const pixelWidth = boxWidth * scale;
  const pixelHeight = boxHeight * scale;
  const pixelDepth = boxDepth * scale;

  const wrapBodyWidth = boxWidth * 2 + boxDepth * 2;
  const wrapPlacement = wrapAsset
    ? computeImagePlacement(
        wrapBodyWidth,
        boxHeight,
        wrapAsset.naturalWidth,
        wrapAsset.naturalHeight,
        wrapAsset.transform,
      )
    : null;

  const [rotationX, setRotationX] = useState(-15);
  const [rotationY, setRotationY] = useState(-30);
  const [autoRotate, setAutoRotate] = useState(true);
  const draggingRef = useRef<{
    startX: number;
    startY: number;
    baseRotationX: number;
    baseRotationY: number;
  } | null>(null);

  useEffect(() => {
    if (!autoRotate) return;
    let animationFrameId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = (now - last) / 1000;
      last = now;
      setRotationY((current) => current + deltaSeconds * 15);
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [autoRotate]);

  const faces: FaceDef[] = [
    {
      key: "front",
      width: pixelWidth,
      height: pixelHeight,
      transform: `translate3d(${-pixelWidth / 2}px, ${-pixelHeight / 2}px, ${pixelDepth / 2}px)`,
    },
    {
      key: "back",
      width: pixelWidth,
      height: pixelHeight,
      transform: `translate3d(${-pixelWidth / 2}px, ${-pixelHeight / 2}px, ${-pixelDepth / 2}px) rotateY(180deg)`,
    },
    {
      key: "rightSide",
      width: pixelDepth,
      height: pixelHeight,
      transform: `translate3d(${-pixelDepth / 2}px, ${-pixelHeight / 2}px, 0) rotateY(90deg) translateZ(${pixelWidth / 2}px)`,
      rotateContent: 90,
    },
    {
      key: "leftSide",
      width: pixelDepth,
      height: pixelHeight,
      transform: `translate3d(${-pixelDepth / 2}px, ${-pixelHeight / 2}px, 0) rotateY(-90deg) translateZ(${pixelWidth / 2}px)`,
      rotateContent: 90,
    },
    {
      key: "top",
      width: pixelWidth,
      height: pixelDepth,
      transform: `translate3d(${-pixelWidth / 2}px, ${-pixelDepth / 2}px, 0) rotateX(90deg) translateZ(${pixelHeight / 2}px)`,
    },
    {
      key: "bottom",
      width: pixelWidth,
      height: pixelDepth,
      transform: `translate3d(${-pixelWidth / 2}px, ${-pixelDepth / 2}px, 0) rotateX(-90deg) translateZ(${pixelHeight / 2}px)`,
    },
  ];

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-surface-muted rounded-lg p-4 select-none"
      style={{ minHeight: 360 }}
    >
      <div
        className="relative flex-1 w-full flex items-center justify-center touch-none"
        style={{ perspective: "1100px" }}
        onPointerDown={(event) => {
          (event.target as Element).setPointerCapture?.(event.pointerId);
          draggingRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            baseRotationX: rotationX,
            baseRotationY: rotationY,
          };
          setAutoRotate(false);
        }}
        onPointerMove={(event) => {
          const dragState = draggingRef.current;
          if (!dragState) return;
          const deltaX = event.clientX - dragState.startX;
          const deltaY = event.clientY - dragState.startY;
          setRotationY(dragState.baseRotationY + deltaX * 0.4);
          setRotationX(
            Math.max(-80, Math.min(80, dragState.baseRotationX - deltaY * 0.4)),
          );
        }}
        onPointerUp={() => {
          draggingRef.current = null;
        }}
        onPointerCancel={() => {
          draggingRef.current = null;
        }}
      >
        <div
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`,
            width: 0,
            height: 0,
            position: "relative",
          }}
        >
          {faces.map((face) => {
            const wrapOffset = wrapAsset
              ? wrapOffsetForFace(face.key, boxWidth, boxDepth)
              : null;
            const useWrap =
              wrapAsset !== undefined &&
              wrapOffset !== null &&
              wrapPlacement !== null;
            const data = useWrap ? undefined : assets[face.key];
            const label = labels[face.key];
            const placement = data
              ? computeImagePlacement(
                  face.width,
                  face.height,
                  data.naturalWidth,
                  data.naturalHeight,
                  data.transform,
                )
              : null;
            return (
              <div
                key={face.key}
                style={{
                  position: "absolute",
                  width: face.width,
                  height: face.height,
                  transform: face.transform,
                  backfaceVisibility: "hidden",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {data && placement && (
                  <img
                    src={data.url}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: placement.centerX,
                      top: placement.centerY,
                      width: placement.drawWidth,
                      height: placement.drawHeight,
                      transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
                      maxWidth: "none",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                )}
                {useWrap && wrapAsset && wrapPlacement && wrapOffset !== null && (
                  <img
                    src={wrapAsset.url}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: (wrapPlacement.centerX - wrapOffset) * scale,
                      top: wrapPlacement.centerY * scale,
                      width: wrapPlacement.drawWidth * scale,
                      height: wrapPlacement.drawHeight * scale,
                      transform: `translate(-50%, -50%) rotate(${wrapPlacement.rotation}deg)`,
                      maxWidth: "none",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                )}
                {!data && !useWrap && (
                  <span
                    style={{
                      color: "var(--color-text-subtle)",
                      fontSize: 11,
                      position: "relative",
                    }}
                  >
                    {face.key}
                  </span>
                )}
                {label && label.text.trim() && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${label.anchorX * 100}%`,
                      top: `${label.anchorY * 100}%`,
                      transform: `translate(-50%, -50%)${
                        face.rotateContent
                          ? ` rotate(${face.rotateContent}deg)`
                          : ""
                      }`,
                      color: label.color || "#000",
                      fontFamily: FAMILY_CSS[label.family],
                      fontSize: label.sizePt * scale * 0.353,
                      fontWeight:
                        label.style === "bold" || label.style === "bolditalic"
                          ? 700
                          : 400,
                      fontStyle:
                        label.style === "italic" ||
                        label.style === "bolditalic"
                          ? "italic"
                          : "normal",
                      textAlign: "center",
                      padding: 4,
                      textShadow:
                        data || useWrap
                          ? "0 1px 2px rgba(0,0,0,0.5)"
                          : undefined,
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                  >
                    {label.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted">
        <button
          type="button"
          onClick={() => setAutoRotate((current) => !current)}
          className="px-3 py-1 rounded-full bg-surface-muted hover:bg-border"
        >
          {autoRotate ? "Pause rotation" : "Auto-rotate"}
        </button>
        <span>Click + drag to rotate</span>
      </div>
    </div>
  );
}
