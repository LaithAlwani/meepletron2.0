"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Smartphone, Users } from "lucide-react";
import { useCoarsePointer } from "@/lib/useCoarsePointer";

const COUNTDOWN_MS = 3000;
const MIN_PLAYERS = 2;

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

// Countdown ring geometry.
const R = 46;
const CIRC = 2 * Math.PI * R;

type Touch = { id: number; x: number; y: number; color: string };
type Phase = "idle" | "counting" | "winner";

export function WhoGoesFirst() {
  const router = useRouter();
  const coarse = useCoarsePointer();

  const [touches, setTouches] = useState<Touch[]>([]);
  const [winner, setWinner] = useState<Touch | null>(null);
  // The winner's 1-based position among the fingers that were down when chosen,
  // so it's always within [1, playerCount] (never a running touch tally).
  const [winnerNo, setWinnerNo] = useState(0);
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
    setWinnerNo(idx + 1); // position among the fingers currently down
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
    setWinnerNo(0);
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
      className="relative h-dvh w-screen touch-none select-none overflow-hidden overscroll-none transition-colors duration-700"
      style={{ backgroundColor: flooded ? winner!.color : "var(--color-background)" }}
    >
      <style>{`@keyframes wgf-ring { from { stroke-dashoffset: 0 } to { stroke-dashoffset: ${CIRC} } }`}</style>

      {/* Top bar: back · title · live player count */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <BackButton
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push("/boardgames")
          }
          onFlood={flooded}
        />
        <h1
          className={`font-display text-base font-bold sm:text-lg ${
            flooded ? "text-white" : "text-foreground"
          }`}
        >
          Who Goes First?
        </h1>
        <CountPill n={touches.length} onFlood={flooded} />
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
            <svg width="112" height="112" viewBox="0 0 112 112" className="block">
              {/* faint track */}
              <circle
                cx="56"
                cy="56"
                r={R}
                fill="none"
                stroke={t.color}
                strokeOpacity={0.2}
                strokeWidth="6"
              />
              {/* depleting countdown ring (restarts each round via the key) */}
              {phase === "counting" && (
                <circle
                  key={touches.length}
                  cx="56"
                  cy="56"
                  r={R}
                  fill="none"
                  stroke={t.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  transform="rotate(-90 56 56)"
                  style={{
                    animation: `wgf-ring ${COUNTDOWN_MS}ms linear forwards`,
                  }}
                />
              )}
            </svg>
            {/* solid center dot */}
            <span
              className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg"
              style={{ backgroundColor: t.color }}
            />
          </div>
        ))}

      {/* Winner overlay */}
      {flooded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full bg-white/25 text-5xl font-black shadow-xl backdrop-blur"
            aria-hidden
          >
            {winnerNo}
          </div>
          <h2 className="font-display text-4xl font-black drop-shadow-sm">
            Player {winnerNo} goes first!
          </h2>
          <p className="text-white/90">Tap anywhere to play again.</p>
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
