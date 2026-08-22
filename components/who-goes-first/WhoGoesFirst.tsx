"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Smartphone, Users } from "lucide-react";
import { useCoarsePointer } from "@/lib/useCoarsePointer";

const COUNTDOWN_MS = 3000;
const MIN_PLAYERS = 2;
// Winner reveal: hold the lone winner for a beat, then paint the color in from
// the screen edges/corners down to the winner's ring.
const FILL_DELAY_MS = 700;
const FILL_MS = 1100;

// Vivid, well-separated colors, assigned to fingers in touch order.
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
type Phase = "idle" | "counting" | "winner";

export function WhoGoesFirst() {
  const router = useRouter();
  const coarse = useCoarsePointer();

  const [touches, setTouches] = useState<Touch[]>([]);
  const [winner, setWinner] = useState<Touch | null>(null);
  // True once the winner's color has spread across the screen — the top bar
  // flips to white only then, so it isn't white on the still-light background.
  const [revealed, setRevealed] = useState(false);
  const phase: Phase = winner
    ? "winner"
    : touches.length >= MIN_PLAYERS
      ? "counting"
      : "idle";

  const touchesRef = useRef<Touch[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Keep a ref of the latest touches for the timer callback (read outside render).
  useEffect(() => {
    touchesRef.current = touches;
  }, [touches]);

  // Flip the top bar to white once the color has reached the edges (the corners
  // fill first, so shortly after the fill starts).
  useEffect(() => {
    if (!winner) return;
    const id = setTimeout(() => setRevealed(true), FILL_DELAY_MS + 350);
    return () => clearTimeout(id);
  }, [winner]);

  // Lock body scroll while the tool is mounted (it owns the whole viewport).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const pickWinner = useCallback(() => {
    const list = touchesRef.current;
    if (list.length < MIN_PLAYERS) return;
    const idx = Math.floor(Math.random() * list.length);
    setWinner(list[idx]);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([40, 40, 120]);
    }
  }, []);

  // Drive the countdown off the NUMBER of fingers: any change (a finger added or
  // lifted) re-runs this and restarts the 3s timer, so adding a finger renews the
  // countdown from the top. Timer-only side effect — no setState in the body; the
  // rings' animation restarts via a `touches.length` key on each ring element.
  useEffect(() => {
    clearTimer();
    if (touches.length >= MIN_PLAYERS && !winner) {
      timerRef.current = setTimeout(pickWinner, COUNTDOWN_MS);
    }
    return clearTimer;
  }, [touches.length, winner, pickWinner, clearTimer]);

  const reset = useCallback(() => {
    setTouches([]);
    setWinner(null);
    setRevealed(false);
  }, []);

  const addTouch = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      // A tap after a result clears the board for a fresh round.
      if (phase === "winner") {
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
        const used = new Set(prev.map((t) => t.color));
        const color =
          COLORS.find((c) => !used.has(c)) ?? COLORS[prev.length % COLORS.length];
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
      if (phase === "winner") return; // ignore lift-off on the results screen
      const id = e.pointerId;
      setTouches((prev) => prev.filter((t) => t.id !== id));
    },
    [phase],
  );

  // ---- Desktop (fine pointer): show a nudge, keep the SEO heading. ----
  if (coarse === false) {
    return (
      <main className="relative flex h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)]">
          <CloseButton onClick={() => router.push("/boardgames")} />
        </div>
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

  return (
    <main
      onPointerDown={addTouch}
      onPointerMove={moveTouch}
      onPointerUp={removeTouch}
      onPointerCancel={removeTouch}
      onContextMenu={(e) => e.preventDefault()}
      className="relative h-dvh w-screen touch-none select-none overflow-hidden overscroll-none bg-background"
    >
      <style>{`
        @keyframes wgf-ring { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${CIRC} } }
        @keyframes wgf-fill { from { width: 260vmax; height: 260vmax } to { width: ${RING_OUTER}px; height: ${RING_OUTER}px } }
        @keyframes wgf-fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* Top bar: title · live player count · close */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <h1
          className={`font-display text-2xl font-extrabold tracking-tight transition-colors ${
            revealed ? "text-white" : "text-foreground"
          }`}
        >
          Who Goes First?
        </h1>
        <div className="flex items-center gap-2">
          <CountPill n={touches.length} onFlood={revealed} />
          <CloseButton
            onClick={() =>
              window.history.length > 1 ? router.back() : router.push("/boardgames")
            }
            onFlood={revealed}
          />
        </div>
      </header>

      {/* Centered instruction while waiting for players (crawlable copy). */}
      {phase === "idle" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
          <p className="max-w-xs text-sm text-muted">
            Everyone place a finger on the screen — one player is chosen after 3
            seconds.
          </p>
        </div>
      )}

      {/* Finger markers: colored dot + countdown ring */}
      {phase !== "winner" &&
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

      {/* After a beat with just the winner's finger showing, the winner's color
          paints IN from the screen edges/corners down to their ring. A circle at
          the winner casts a huge colored box-shadow (color everywhere but the
          circle); shrinking it from screen-covering to the ring reveals the
          color from the corners inward. */}
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

      {/* The winner's finger stays exactly as it looked in play — dot + ring —
          on top of the fill, visible immediately. */}
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

      {/* Winner overlay — the flooded color IS the result, so all this adds is
          the prompt to start over. Fades in once the color has spread a bit. */}
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
    </main>
  );
}

function CloseButton({
  onClick,
  onFlood,
}: {
  onClick: () => void;
  onFlood?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className={
        onFlood
          ? "flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur transition-colors hover:bg-white/30"
          : "flex h-10 w-10 items-center justify-center rounded-xl bg-surface/80 text-muted backdrop-blur transition-colors hover:bg-surface-2 hover:text-foreground"
      }
    >
      <X className="h-5 w-5" />
    </button>
  );
}

function CountPill({ n, onFlood }: { n: number; onFlood: boolean }) {
  return (
    <div
      aria-label={`${n} ${n === 1 ? "player" : "players"}`}
      className={
        onFlood
          ? "flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold text-white backdrop-blur"
          : "flex items-center gap-1.5 rounded-xl bg-surface/80 px-3 py-2 text-sm font-semibold text-muted backdrop-blur"
      }
    >
      <Users className="h-4.5 w-4.5" />
      <span className="tabular-nums">{n}</span>
    </div>
  );
}
