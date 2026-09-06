import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold">Privacy Policy</h1>
      <div className="space-y-4 text-sm leading-relaxed text-muted">
        <p>
          Meepletron stores only what it needs to run: your account details, the
          games and rulebooks you interact with, and your chat history.
        </p>
        <p>
          We use your questions and rulebook content to generate grounded answers.
          We don&apos;t sell your data. Contact-form messages are kept only to reply
          to you.
        </p>
        <p>
          If you link a BoardGameGeek account, we fetch your collection from
          BoardGameGeek and store it against your Meepletron account. We keep an
          encrypted BoardGameGeek session token so we can sync again — we never
          store your BoardGameGeek password. Unlinking, or deleting your
          Meepletron account, removes the token and the synced collection.
        </p>
        <p>
          Questions? Reach out through the contact form on the home page.
        </p>
      </div>
    </div>
  );
}
