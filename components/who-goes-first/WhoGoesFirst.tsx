"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone, Users, Crown, ListOrdered } from "lucide-react";
import { useCoarsePointer } from "@/lib/useCoarsePointer";

const COUNTDOWN_MS = 3000;
const MIN_PLAYERS = 2;
// Winner reveal: hold the lone winner for a beat, then paint the color in from
// the screen edges/corners down to the winner's ring.
const FILL_DELAY_MS = 700;
const FILL_MS = 1100;

// Vivid, well-separated colors, assigned to fingers at random.
const COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // amber
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#8b5cf6", // violet
  "#84cc16", // lime
];

/** Hue (0–360) of a hex color, so we can keep two fingers from sharing a shade. */
function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const HUES = COLORS.map(hueOf);
// Below this many degrees apart, two colors read as the same shade (e.g. the
// purple/violet and red/orange/amber pairs in the palette).
const MIN_HUE_DIST = 35;

/** Circular distance between two hues (0–180). */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Countdown ring geometry, derived from the dot so the gap stays explicit.
// The ring still clears the dot's glow — it just hugs it closely.
const DOT = 105; // dot diameter in px (1.5× the original 70)
const RING_W = 10; // ring stroke width
const GAP = 14; // dot edge -> ring inner edge
const R = DOT / 2 + GAP + RING_W / 2; // ring centerline
const SVG = 2 * R + RING_W + 8; // ring box + stroke + padding
const MID = SVG / 2;
const CIRC = 2 * Math.PI * R;
const RING_OUTER = 2 * R + RING_W; // the color fill converges to this circle

// A second contact within a fingertip's width of an existing one is the same
// finger (people press with the pad, not the tip) — ignore it so one finger
// isn't counted as two players.
const MIN_SEPARATION = 56; // px

type Touch = { id: number; x: number; y: number; color: string };
type Phase = "idle" | "counting" | "winner" | "ordered";
type Mode = "first" | "order";

export function WhoGoesFirst() {
  const coarse = useCoarsePointer();

  const [touches, setTouches] = useState<Touch[]>([]);
  const [winner, setWinner] = useState<Touch | null>(null);
  // Order mode: finger id -> its turn-order rank (1..N).
  const [ranks, setRanks] = useState<Record<number, number> | null>(null);
  const [mode, setMode] = useState<Mode>("first");
  const phase: Phase = winner
    ? "winner"
    : ranks
      ? "ordered"
      : touches.length >= MIN_PLAYERS
        ? "counting"
        : "idle";

  const touchesRef = useRef<Touch[]>([]);
  const modeRef = useRef<Mode>(mode);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Keep refs of the latest touches + mode for the timer callback (read outside
  // render, after the countdown fires).
  useEffect(() => {
    touchesRef.current = touches;
  }, [touches]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Lock body scroll while the touch tool owns the viewport (mobile only — the
  // desktop nudge is a normal, scrollable page under the navbar).
  useEffect(() => {
    if (coarse === false) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [coarse]);

  const buzz = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([40, 40, 120]);
    }
  };

  // Countdown complete → produce the result for the active mode.
  const finish = useCallback(() => {
    const list = touchesRef.current;
    if (list.length < MIN_PLAYERS) return;
    if (modeRef.current === "order") {
      // A random permutation of 1..N, one rank per finger (Fisher–Yates).
      const perm = list.map((_, i) => i + 1);
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      const next: Record<number, number> = {};
      list.forEach((t, i) => {
        next[t.id] = perm[i];
      });
      setRanks(next);
    } else {
      setWinner(list[Math.floor(Math.random() * list.length)]);
    }
    buzz();
  }, []);

  // Drive the countdown off the NUMBER of fingers: any change (a finger added or
  // lifted) re-runs this and restarts the 3s timer, so adding a finger renews the
  // countdown from the top. Timer-only side effect — no setState in the body; the
  // rings' animation restarts via a `touches.length` key on each ring element.
  useEffect(() => {
    clearTimer();
    if (touches.length >= MIN_PLAYERS && !winner && !ranks) {
      timerRef.current = setTimeout(finish, COUNTDOWN_MS);
    }
    return clearTimer;
  }, [touches.length, winner, ranks, finish, clearTimer]);

  const reset = useCallback(() => {
    setTouches([]);
    setWinner(null);
    setRanks(null);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "first" ? "order" : "first"));
    // Drop any result so the next round runs under the new mode.
    setWinner(null);
    setRanks(null);
  }, []);

  const addTouch = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      // A tap after a result clears the board for a fresh round.
      if (phase === "winner" || phase === "ordered") {
        reset();
        return;
      }
      const id = e.pointerId;
      const x = e.clientX;
      const y = e.clientY;
      setTouches((prev) => {
        if (prev.some((t) => t.id === id)) return prev;
        // A second contact landing on top of an existing one is the same finger
        // (its pad, not the tip) — don't add it as a separate player.
        if (prev.some((t) => Math.hypot(t.x - x, t.y - y) < MIN_SEPARATION)) {
          return prev;
        }
        // Pick a random color, preferring ones not already in play AND whose
        // hue is well clear of every finger already down — so no two players get
        // look-alike shades. Relax only if that would leave nothing.
        const used = new Set(prev.map((t) => t.color));
        const inPlayHues = prev.map((t) => hueOf(t.color));
        const distinct = COLORS.filter(
          (c, i) =>
            !used.has(c) &&
            inPlayHues.every((h) => hueGap(HUES[i], h) >= MIN_HUE_DIST),
        );
        const free = COLORS.filter((c) => !used.has(c));
        const pool = distinct.length ? distinct : free.length ? free : COLORS;
        const color = pool[Math.floor(Math.random() * pool.length)];
        return [...prev, { id, x, y, color }];
      });
    },
    [phase, reset],
  );

  const moveTouch = useCallback((e: React.PointerEvent) => {
    const { pointerId, clientX, clientY } = e;
    setTouches((list) => {
      const i = list.findIndex((t) => t.id === pointerId);
      if (i === -1) return list;
      const copy = list.slice();
      copy[i] = { ...copy[i], x: clientX, y: clientY };
      return copy;
    });
  }, []);

  const removeTouch = useCallback(
    (e: React.PointerEvent) => {
      // Ignore lift-off on a results screen (winner or turn order).
      if (phase === "winner" || phase === "ordered") return;
      const id = e.pointerId;
      setTouches((prev) => prev.filter((t) => t.id !== id));
    },
    [phase],
  );

  // ---- Desktop (fine pointer): show a nudge, keep the SEO heading. The site
  // navbar sits above this like any other page. ----
  if (coarse === false) {
    return (
      <main className="flex min-h-[80dvh] flex-col items-center justify-center gap-5 px-6 text-center">
        <Smartphone className="h-12 w-12 text-accent" />
        <h1 className="font-display text-3xl font-bold text-foreground">
          Who Goes First?
        </h1>
        <p className="max-w-sm text-muted">
          This is a touch game — open{" "}
          <span className="font-semibold text-foreground">
            meepletron.com/who-goes-first
          </span>{" "}
          on your phone or tablet. Everyone holds a finger on the screen and one
          player is randomly chosen to go first.
        </p>
      </main>
    );
  }

  const flooded = phase === "winner";
  const pillPos = "top-[calc(env(safe-area-inset-top)+3.5rem)]";

  return (
    <>
      <main
        onPointerDown={addTouch}
        onPointerMove={moveTouch}
        onPointerUp={removeTouch}
        onPointerCancel={removeTouch}
        onContextMenu={(e) => e.preventDefault()}
        className="fixed inset-0 z-0 touch-none select-none overflow-hidden overscroll-none bg-background"
      >
        <style>{`
          @keyframes wgf-ring { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${CIRC} } }
          @keyframes wgf-fill { from { width: 260vmax; height: 260vmax } to { width: ${RING_OUTER}px; height: ${RING_OUTER}px } }
          @keyframes wgf-fade { from { opacity: 0 } to { opacity: 1 } }
        `}</style>

        {/* Centered instruction while waiting for players (crawlable copy). */}
        {phase === "idle" && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
            <p className="max-w-xs text-sm text-muted">
              Everyone place a finger on the screen —{" "}
              {mode === "order"
                ? "turn order is set after 3 seconds."
                : "one player is chosen after 3 seconds."}
            </p>
          </div>
        )}

        {/* Finger markers: colored dot + countdown ring (idle / counting) */}
        {(phase === "idle" || phase === "counting") &&
          touches.map((t) => (
            <div
              key={t.id}
              className="pointer-events-none absolute z-20"
              style={{ left: t.x, top: t.y, transform: "translate(-50%, -50%)" }}
            >
              <svg
                width={SVG}
                height={SVG}
                viewBox={`0 0 ${SVG} ${SVG}`}
                className="block"
              >
                {/* faint track */}
                <circle
                  cx={MID}
                  cy={MID}
                  r={R}
                  fill="none"
                  stroke={t.color}
                  strokeOpacity={0.25}
                  strokeWidth={RING_W}
                />
                {/* depleting countdown ring (restarts each round via the key) */}
                {phase === "counting" && (
                  <circle
                    key={touches.length}
                    cx={MID}
                    cy={MID}
                    r={R}
                    fill="none"
                    stroke={t.color}
                    strokeWidth={RING_W}
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    transform={`rotate(-90 ${MID} ${MID})`}
                    style={{
                      animation: `wgf-ring ${COUNTDOWN_MS}ms linear forwards`,
                    }}
                  />
                )}
              </svg>
              {/* solid center dot with a tight colored glow */}
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: DOT,
                  height: DOT,
                  backgroundColor: t.color,
                  boxShadow: `0 0 24px 6px ${t.color}`,
                }}
              />
            </div>
          ))}

        {/* Order mode result: every finger stays, showing its 1..N turn rank. */}
        {phase === "ordered" &&
          touches.map((t) => (
            <div
              key={t.id}
              className="animate-in pointer-events-none absolute z-20"
              style={{ left: t.x, top: t.y, transform: "translate(-50%, -50%)" }}
            >
              <span
                className="font-display flex items-center justify-center rounded-full font-extrabold text-white"
                style={{
                  width: DOT,
                  height: DOT,
                  fontSize: DOT * 0.5,
                  backgroundColor: t.color,
                  boxShadow: `0 0 24px 6px ${t.color}`,
                }}
              >
                {ranks?.[t.id]}
              </span>
            </div>
          ))}

        {/* First mode: the winner's color paints IN from the screen edges. */}
        {flooded && (
          <div
            className="pointer-events-none absolute left-0 top-0 z-10 rounded-full"
            style={{
              left: winner!.x,
              top: winner!.y,
              transform: "translate(-50%, -50%)",
              boxShadow: `0 0 0 100vmax ${winner!.color}`,
              animation: `wgf-fill ${FILL_MS}ms ease-in-out ${FILL_DELAY_MS}ms both`,
            }}
          />
        )}

        {/* The winner's finger stays exactly as it looked in play — dot + ring. */}
        {flooded && (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: winner!.x,
              top: winner!.y,
              transform: "translate(-50%, -50%)",
            }}
          >
            <svg width={SVG} height={SVG} viewBox={`0 0 ${SVG} ${SVG}`} className="block">
              <circle
                cx={MID}
                cy={MID}
                r={R}
                fill="none"
                stroke={winner!.color}
                strokeWidth={RING_W}
              />
            </svg>
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: DOT,
                height: DOT,
                backgroundColor: winner!.color,
                boxShadow: `0 0 24px 6px ${winner!.color}`,
              }}
            />
          </div>
        )}

        {/* First-mode winner prompt — fades in once the color has spread a bit. */}
        {flooded && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] text-center text-white"
            style={{
              animation: `wgf-fade 500ms ease-out ${FILL_DELAY_MS + FILL_MS}ms both`,
            }}
          >
            <p className="font-display text-2xl font-bold drop-shadow-sm">
              Tap anywhere to restart
            </p>
          </div>
        )}

        {/* Order-mode prompt (no flood behind it, so it needs its own chip). */}
        {phase === "ordered" && (
          <div className="animate-in absolute inset-x-0 bottom-0 z-20 flex justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
            <p className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-md">
              Tap anywhere to restart
            </p>
          </div>
        )}
      </main>

      {/* Top-left: the mode toggle. Sits above the touch surface (a sibling, so
          tapping it never drops a finger). */}
      <button
        type="button"
        onClick={toggleMode}
        aria-label={`Mode: ${mode === "first" ? "first player" : "turn order"} — tap to switch`}
        className={`fixed left-3 z-20 flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm ${pillPos}`}
      >
        {mode === "first" ? (
          <Crown className="h-4 w-4 text-accent" />
        ) : (
          <ListOrdered className="h-4 w-4 text-accent" />
        )}
        {mode === "first" ? "First player" : "Turn order"}
      </button>

      {/* Top-right: live player count, under the notification bell. Passive
          (pointer-events-none) so a finger can still land beneath it. */}
      <div
        aria-label={`${touches.length} ${touches.length === 1 ? "player" : "players"}`}
        className={`pointer-events-none fixed right-3 z-20 flex items-center gap-1 rounded-full bg-surface px-2.5 py-1.5 text-sm font-semibold text-muted shadow-sm ${pillPos}`}
      >
        <Users className="h-4 w-4" />
        <span className="tabular-nums">{touches.length}</span>
      </div>
    </>
  );
}
