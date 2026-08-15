"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Smartphone, Users } from "lucide-react";
import { useCoarsePointer } from "@/lib/useCoarsePointer";

const COUNTDOWN_MS = 3000;
const MIN_PLAYERS = 2;
// How long the winner's color takes to paint across the screen.
const FLOOD_MS = 2000;

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

// Countdown ring geometry. The ring sits clearly outside the dot + its glow so
// it stays readable (it's the finger's own color, which the glow would swallow).
const R = 66;
const SVG = 148; // 2*R + stroke + padding
const MID = SVG / 2;
const CIRC = 2 * Math.PI * R;

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

  // Flip the top bar to white once the color reveal has covered the screen.
  useEffect(() => {
    if (!winner) return;
    const id = setTimeout(() => setRevealed(true), 1750);
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
      <main className="flex h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <BackButton onClick={() => router.push("/boardgames")} />
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
        @keyframes wgf-flood { from { transform: translate(-50%, -50%) scale(0.01) } to { transform: translate(-50%, -50%) scale(32) } }
        @keyframes wgf-fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* Top bar: back · title · live player count */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <BackButton
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push("/boardgames")
          }
          onFlood={revealed}
        />
        <h1
          className={`font-display text-base font-bold transition-colors sm:text-lg ${
            revealed ? "text-white" : "text-foreground"
          }`}
        >
          Who Goes First?
        </h1>
        <CountPill n={touches.length} onFlood={revealed} />
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
                strokeWidth="9"
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
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  style={{
                    animation: `wgf-ring ${COUNTDOWN_MS}ms linear forwards`,
                  }}
                />
              )}
            </svg>
            {/* solid center dot (1.25×) with a tighter colored glow */}
            <span
              className="absolute left-1/2 top-1/2 h-[4.375rem] w-[4.375rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                backgroundColor: t.color,
                boxShadow: `0 0 18px 4px ${t.color}`,
              }}
            />
          </div>
        ))}

      {/* Winner's color paints outward from their finger to fill the screen. */}
      {flooded && (
        <div
          className="pointer-events-none absolute z-10 h-60 w-60 rounded-full"
          style={{
            left: winner!.x,
            top: winner!.y,
            backgroundColor: winner!.color,
            transform: "translate(-50%, -50%) scale(0.01)",
            animation: `wgf-flood ${FLOOD_MS}ms ease-out forwards`,
          }}
        />
      )}

      {/* Winner overlay — the flooded color IS the result, so all this adds is
          the prompt to start over. Fades in once the color has spread a bit. */}
      {flooded && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center text-white"
          style={{ animation: "wgf-fade 500ms ease-out 1200ms both" }}
        >
          <p className="font-display text-2xl font-bold drop-shadow-sm">
            Tap anywhere to restart
          </p>
        </div>
      )}
    </main>
  );
}

function BackButton({
  onClick,
  onFlood,
}: {
  onClick: () => void;
  onFlood?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      className={
        onFlood
          ? "flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/30"
          : "flex items-center gap-1.5 rounded-xl bg-surface/80 px-3 py-2 text-sm font-medium text-muted backdrop-blur transition-colors hover:bg-surface-2 hover:text-foreground"
      }
    >
      <ArrowLeft className="h-[18px] w-[18px]" />
      Back
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
      <Users className="h-[18px] w-[18px]" />
      <span className="tabular-nums">{n}</span>
    </div>
  );
}
