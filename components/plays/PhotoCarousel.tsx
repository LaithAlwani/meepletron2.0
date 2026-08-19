"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A swipeable photo carousel — native scroll-snap (touch/trackpad), chevron
 * arrows on desktop hover, and dot indicators. Single image renders plainly.
 */
export function PhotoCarousel({ images }: { images: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={images[0]}
        alt=""
        className="aspect-video w-full object-cover"
      />
    );
  }

  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = ref.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="group relative">
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ scrollbarWidth: "none" }}
        className="flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt=""
            className="aspect-video w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {/* Desktop arrows (hover) */}
      {index > 0 && (
        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/45 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/65 sm:group-hover:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {index < images.length - 1 && (
        <button
          type="button"
          onClick={() => go(index + 1)}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/45 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/65 sm:group-hover:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Dots */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              i === index ? "bg-white" : "bg-white/50",
            )}
          />
        ))}
      </div>
    </div>
  );
}
