/** Faded full-screen cover art behind the page (ported from the original). */
export function BackgroundCover({ url }: { url: string }) {
  return (
    <div className="fade-in pointer-events-none fixed inset-0 -z-10" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover object-top opacity-[0.12]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background" />
    </div>
  );
}
