import Link from "next/link";
import Image from "next/image";
import ContactForm from "@/components/ContactForm";

export default function HomePage() {
  return (
    <>
      <div className="mx-auto max-w-5xl px-4">
      <section className="animate-in flex flex-col items-center py-16 text-center sm:py-24">
        <Image
          src="/logo.webp"
          alt="Meepletron"
          width={128}
          height={160}
          priority
          className="mb-6 h-32 w-auto"
        />
        <h1 className="max-w-2xl text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
          Ask your board game rules. Get answers from the rulebook.
        </h1>
        <p className="mt-4 max-w-xl text-balance text-lg text-muted">
          Meepletron reads the actual rulebook and answers your questions with
          citations — no more digging through 40 pages mid-game.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/boardgames"
            className="rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Browse games
          </Link>
          <Link
            href="/tuckbox"
            className="rounded-lg border border-border bg-surface px-5 py-3 font-semibold transition-colors hover:bg-surface-2"
          >
            Tuckbox generator
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-3">
        {[
          {
            icon: "📖",
            title: "Grounded answers",
            body: "Every answer is drawn from the uploaded rulebook and cites its source passage.",
          },
          {
            icon: "🧩",
            title: "Expansions & modes",
            body: "Pick exactly which rulebooks — base game, solo mode, expansions — you're asking about.",
          },
          {
            icon: "✂️",
            title: "Tuckbox maker",
            body: "Design a print-ready card box using a game's cover art, right in the browser.",
          },
        ].map((f, i) => (
          <div
            key={f.title}
            style={{ animationDelay: `${100 + i * 80}ms` }}
            className="animate-in rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg"
          >
            <div className="mb-2 text-2xl" aria-hidden>
              {f.icon}
            </div>
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>
      </div>

      <ContactForm />
    </>
  );
}
