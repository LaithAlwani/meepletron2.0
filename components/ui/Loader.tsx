/**
 * Branded loading spinner — the Meepletron mascot bobbing with a pulsing halo.
 * Ported from the original project (framer-motion → CSS animations).
 */
export function Loader({
  fullScreen = false,
  size = 96,
}: {
  fullScreen?: boolean;
  size?: number;
}) {
  const showHalo = size >= 22;
  return (
    <div
      className={
        fullScreen
          ? "flex min-h-[70vh] w-full items-center justify-center"
          : "flex items-center justify-center"
      }
    >
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {showHalo && (
          <span
            aria-hidden
            className="loader-halo absolute inset-0 rounded-full bg-accent/20"
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.webp"
          alt="Loading"
          className="loader-bob relative object-contain"
          style={{ width: size, height: size }}
        />
      </div>
    </div>
  );
}
