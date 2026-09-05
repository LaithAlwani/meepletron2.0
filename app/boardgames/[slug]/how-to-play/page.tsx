import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { ChevronRight, Users, Clock, Baby, Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { InlineAsk } from "@/components/boardgames/InlineAsk";
import { SITE_URL } from "@/lib/site";
import { formatPlayTime } from "@/lib/format";

/** Strip inline citation markers ("[1]") so the text reads cleanly on the page
 *  and in structured data (the source chips only make sense in the live chat). */
function clean(text: string): string {
  return text.replace(/\s*\[\d+\]/g, "").trim();
}

async function load(slug: string) {
  const game = await fetchQuery(api.games.getByHandle, { handle: slug });
  if (!game) return null;
  const gameId = game._id as Id<"games">;
  const [faqs, reminders] = await Promise.all([
    fetchQuery(api.faqs.listForGame, { gameId }),
    fetchQuery(api.reminders.listForGame, { gameId }),
  ]);
  return { game, faqs, reminders };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = await fetchQuery(api.games.getByHandle, { handle: slug }).catch(
    () => null,
  );
  if (!game) return {};
  const title = `${game.title} rules & rulebook — how to play`;
  const description = `${game.title} rules made simple: setup, turns, scoring and how to win. Download the official ${game.title} rulebook (PDF) and get answers to the most-asked ${game.title} rules questions.`;
  return {
    title,
    description,
    alternates: { canonical: `/boardgames/${slug}/how-to-play` },
    openGraph: {
      title: `${title} · Meepletron`,
      description,
      url: `/boardgames/${slug}/how-to-play`,
      type: "article",
    },
  };
}

export default async function HowToPlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { game, faqs, reminders } = data;

  const gameId = game._id as Id<"games">;
  const manual =
    game.rulebooks.find((r) => r.kind !== "download" && r.downloadUrl) ??
    game.rulebooks.find((r) => r.downloadUrl);

  const players =
    game.minPlayers != null
      ? game.maxPlayers && game.maxPlayers !== game.minPlayers
        ? `${game.minPlayers}–${game.maxPlayers} players`
        : `${game.minPlayers} player${game.minPlayers === 1 ? "" : "s"}`
      : null;
  const time = formatPlayTime(game.maxPlayTime ?? game.minPlayTime ?? undefined);

  // Structured data — a Game entity + an FAQ page (both feed Google + AI search).
  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Game",
      name: game.title,
      url: `${SITE_URL}/boardgames/${game.slug}`,
      ...(game.description ? { description: clean(game.description) } : {}),
      ...(game.imageUrl || game.thumbnailUrl
        ? { image: game.imageUrl ?? game.thumbnailUrl }
        : {}),
      ...(game.minPlayers != null
        ? {
            numberOfPlayers: {
              "@type": "QuantitativeValue",
              minValue: game.minPlayers,
              ...(game.maxPlayers != null ? { maxValue: game.maxPlayers } : {}),
            },
          }
        : {}),
    },
    ...(faqs.length > 0
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: clean(f.answer) },
            })),
          },
        ]
      : []),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Library",
          item: `${SITE_URL}/boardgames`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: game.title,
          item: `${SITE_URL}/boardgames/${game.slug}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "How to play",
          item: `${SITE_URL}/boardgames/${game.slug}/how-to-play`,
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb back to the game */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted"
      >
        <Link href="/boardgames" className="hover:text-foreground">
          Library
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <Link
          href={`/boardgames/${game.slug}`}
          className="min-w-0 truncate hover:text-foreground"
        >
          {game.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="shrink-0 text-foreground">How to play</span>
      </nav>

      {/* Header — thumbnail + section eyebrow + game title */}
      <div className="mt-4 flex items-center gap-4">
        {(game.thumbnailUrl || game.imageUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.thumbnailUrl ?? game.imageUrl ?? undefined}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-border sm:h-20 sm:w-20"
          />
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent">
            How to play
          </p>
          <h1 className="font-display mt-0.5 truncate text-xl font-extrabold tracking-tight sm:text-2xl">
            {game.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {players && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {players}
              </span>
            )}
            {time && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {time}
              </span>
            )}
            {game.minAge && (
              <span className="inline-flex items-center gap-1.5">
                <Baby className="h-4 w-4" />
                Ages {game.minAge}+
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The one rulebook download, up top */}
      {manual?.downloadUrl && (
        <a
          href={manual.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-5 ${buttonClasses("subtle", "md")}`}
        >
          <Download className="h-4 w-4" />
          Download the rulebook
        </a>
      )}

      {/* Ask about the rules — the first thing on the page */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-extrabold">
          Ask about the rules
        </h2>
        <p className="mt-1 text-sm text-muted">
          Grounded in {game.title}&apos;s rulebook — cite-checked answers, not
          guesses.
        </p>
        <div className="mt-4">
          <InlineAsk
            gameId={gameId}
            baseSlug={game.parent ? game.parent.slug : game.slug}
            moduleId={game.parent ? gameId : undefined}
          />
        </div>
      </section>

      {/* Rules refresher */}
      {reminders.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">Rules refresher</h2>
          <p className="mt-1 text-sm text-muted">
            The easy-to-forget bits, straight from the rulebook.
          </p>
          <ul className="mt-3 divide-y divide-border-muted border-y border-border-muted">
            {reminders.map((r, i) => (
              <li key={i} className="py-3.5">
                <p className="font-semibold">{r.label}</p>
                <p className="mt-0.5 text-sm text-muted">{clean(r.detail)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Common questions */}
      {faqs.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold">
            Common questions
          </h2>
          <div className="mt-3 divide-y divide-border-muted border-y border-border-muted">
            {faqs.map((f) => (
              <details key={f._id} className="group">
                <summary className="flex cursor-pointer items-center justify-between gap-3 py-3.5 font-medium marker:content-none">
                  {f.question}
                  <span className="shrink-0 text-subtle transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="whitespace-pre-wrap pb-4 text-sm text-muted">
                  {clean(f.answer)}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {(faqs.length > 0 || reminders.length > 0) && (
        <p className="mt-8 text-center text-xs text-subtle">
          Rules summaries are AI-generated from the official rulebook and may
          contain mistakes — check the manual for anything critical.
        </p>
      )}
    </div>
  );
}
