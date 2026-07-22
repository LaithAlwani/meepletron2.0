"use client";

import { useRef } from "react";
import {
  computeImagePlacement,
  type FaceImageData,
  type FaceImageTransform,
  type ImageRotation,
} from "@/lib/tuckbox/types";

type Props = {
  data: FaceImageData;
  frameAspect: number;
  onChange: (next: FaceImageTransform) => void;
};

const FRAME_MAX = 140;

const ANCHORS: {
  label: string;
  anchorX: number;
  anchorY: number;
  title: string;
}[][] = [
  [
    { label: "↖", anchorX: 0, anchorY: 0, title: "Top-left" },
    { label: "↑", anchorX: 0.5, anchorY: 0, title: "Top-center" },
    { label: "↗", anchorX: 1, anchorY: 0, title: "Top-right" },
  ],
  [
    { label: "←", anchorX: 0, anchorY: 0.5, title: "Left" },
    { label: "•", anchorX: 0.5, anchorY: 0.5, title: "Center" },
    { label: "→", anchorX: 1, anchorY: 0.5, title: "Right" },
  ],
  [
    { label: "↙", anchorX: 0, anchorY: 1, title: "Bottom-left" },
    { label: "↓", anchorX: 0.5, anchorY: 1, title: "Bottom-center" },
    { label: "↘", anchorX: 1, anchorY: 1, title: "Bottom-right" },
  ],
];

export function ImagePositioner({ data, frameAspect, onChange }: Props) {
  const aspectRatio = Math.max(0.2, Math.min(5, frameAspect));
  const frameWidth = aspectRatio >= 1 ? FRAME_MAX : FRAME_MAX * aspectRatio;
  const frameHeight = aspectRatio >= 1 ? FRAME_MAX / aspectRatio : FRAME_MAX;

  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseAnchorX: number;
    baseAnchorY: number;
    rangeX: number;
    rangeY: number;
  } | null>(null);

  const placement = computeImagePlacement(
    frameWidth,
    frameHeight,
    data.naturalWidth,
    data.naturalHeight,
    data.transform,
  );

  const { zoom, anchorX, anchorY } = data.transform;

  function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  function isActiveAnchor(targetX: number, targetY: number) {
    return (
      Math.abs(anchorX - targetX) < 0.02 && Math.abs(anchorY - targetY) < 0.02
    );
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseAnchorX: data.transform.anchorX,
      baseAnchorY: data.transform.anchorY,
      rangeX: frameWidth - placement.width,
      rangeY: frameHeight - placement.height,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current;
    if (!dragState) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const nextAnchorX =
      Math.abs(dragState.rangeX) < 0.5
        ? dragState.baseAnchorX
        : clamp01(dragState.baseAnchorX + deltaX / dragState.rangeX);
    const nextAnchorY =
      Math.abs(dragState.rangeY) < 0.5
        ? dragState.baseAnchorY
        : clamp01(dragState.baseAnchorY + deltaY / dragState.rangeY);
    onChange({
      ...data.transform,
      anchorX: nextAnchorX,
      anchorY: nextAnchorY,
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="relative overflow-hidden rounded border border-border bg-surface-muted cursor-grab active:cursor-grabbing touch-none shrink-0"
        style={{ width: frameWidth, height: frameHeight }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to reposition"
      >
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
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      </div>
      <div className="flex-1 space-y-2">
        <label className="block text-xs text-muted">
          Zoom: {(zoom * 100).toFixed(0)}%
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(event) =>
              onChange({
                ...data.transform,
                zoom: parseFloat(event.target.value),
              })
            }
            className="w-full mt-1"
          />
        </label>
        <div className="space-y-1">
          <div className="text-xs text-muted">Snap to anchor</div>
          <div className="grid grid-cols-3 gap-0.5 w-[78px]">
            {ANCHORS.flat().map((anchor) => {
              const active = isActiveAnchor(anchor.anchorX, anchor.anchorY);
              return (
                <button
                  key={anchor.title}
                  type="button"
                  title={anchor.title}
                  onClick={() =>
                    onChange({
                      ...data.transform,
                      anchorX: anchor.anchorX,
                      anchorY: anchor.anchorY,
                    })
                  }
                  className={`h-6 w-6 rounded text-xs flex items-center justify-center transition-colors ${
                    active
                      ? "bg-primary text-primary-fg"
                      : "bg-surface-muted hover:bg-border text-muted"
                  }`}
                >
                  {anchor.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              const next = ((data.transform.rotation + 90) %
                360) as ImageRotation;
              onChange({ ...data.transform, rotation: next });
            }}
            className="px-2 py-1 rounded bg-surface-muted hover:bg-border text-muted"
            title="Rotate 90°"
          >
            ↻ {data.transform.rotation}°
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ zoom: 1, anchorX: 0.5, anchorY: 0.5, rotation: 0 })
            }
            className="text-muted hover:text-foreground underline"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
