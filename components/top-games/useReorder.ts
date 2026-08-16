"use client";

import { useRef, useState } from "react";

type Drag = { grab: number; target: number; dy: number };

/**
 * Hand-rolled vertical drag-to-reorder with smooth motion, no dependency.
 *
 * The array is NOT reordered mid-drag. Instead the grabbed row lifts and follows
 * the pointer (translateY, no transition), while the rows between its origin and
 * the current target slide one slot out of the way (translateY ± rowHeight, with
 * a transition — that's the animation). Only on drop do we commit the reorder
 * once, so the DOM never churns while dragging and the transforms stay smooth.
 * Modeled on the axis-locked pointer gesture in app/admin/boardgames/page.tsx.
 *
 * Wire `containerRef` to the `<ul>`, spread `handleProps(index)` onto each row's
 * grip handle, and `style={rowStyle(index)}` onto each `<li>`.
 */
export function useReorder(count: number, onMove: (from: number, to: number) => void) {
  const containerRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const startY = useRef(0);
  const rowH = useRef(0);

  function set(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
  }

  /** Row pitch (height + gap), immune to transforms via offsetTop. */
  function measureRowHeight(): number {
    const c = containerRef.current;
    if (!c || c.children.length === 0) return 0;
    if (c.children.length >= 2) {
      const a = c.children[0] as HTMLElement;
      const b = c.children[1] as HTMLElement;
      return b.offsetTop - a.offsetTop;
    }
    return (c.children[0] as HTMLElement).offsetHeight + 8;
  }

  function onPointerDown(index: number, e: React.PointerEvent) {
    startY.current = e.clientY;
    rowH.current = measureRowHeight();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    set({ grab: index, target: index, dy: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    const cur = dragRef.current;
    if (!cur) return;
    const dy = e.clientY - startY.current;
    const steps = rowH.current ? Math.round(dy / rowH.current) : 0;
    const target = Math.max(0, Math.min(count - 1, cur.grab + steps));
    set({ grab: cur.grab, target, dy });
  }

  function onPointerUp() {
    const d = dragRef.current;
    set(null);
    if (d && d.target !== d.grab) onMove(d.grab, d.target);
  }

  /** Spread onto the grip handle of row `index`. */
  function handleProps(index: number) {
    return {
      onPointerDown: (e: React.PointerEvent) => onPointerDown(index, e),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      style: {
        touchAction: "none" as const,
        cursor: drag ? ("grabbing" as const) : ("grab" as const),
      },
    };
  }

  /** Spread onto row `index`'s `<li>` — drives the follow + slide transforms. */
  function rowStyle(index: number): React.CSSProperties {
    if (!drag) return {};
    const { grab, target, dy } = drag;
    if (index === grab) {
      return {
        transform: `translateY(${dy}px) scale(1.03)`,
        zIndex: 30,
        position: "relative",
        transition: "none",
      };
    }
    let shift = 0;
    if (grab < target && index > grab && index <= target) shift = -rowH.current;
    else if (grab > target && index < grab && index >= target) shift = rowH.current;
    return {
      transform: `translateY(${shift}px)`,
      transition: "transform 160ms cubic-bezier(0.2, 0, 0, 1)",
    };
  }

  return {
    containerRef,
    dragIndex: drag ? drag.grab : null,
    dragging: drag != null,
    handleProps,
    rowStyle,
  };
}
