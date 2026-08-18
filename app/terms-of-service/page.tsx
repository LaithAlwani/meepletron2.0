import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold">Terms of Service</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted">
        <p>
          Meepletron is provided as-is to help you learn board game rules. Answers
          are AI-generated from uploaded rulebooks and may occasionally be wrong —
          always defer to the official rules.
        </p>
        <p>
          Use the service fairly: don&apos;t abuse it, upload content you don&apos;t
          have the right to, or attempt to disrupt it. We may adjust limits to keep
          things running for everyone.
        </p>
        <p>
          By using Meepletron you agree to these terms.
        </p>
      </div>
    </div>
  );
}
