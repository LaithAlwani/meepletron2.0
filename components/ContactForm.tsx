"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";

const fieldClass =
  "peer w-full border-0 border-b-2 border-border bg-transparent pb-1.5 pt-5 text-sm text-foreground placeholder-transparent transition-colors focus:border-accent focus:outline-none";
const labelClass =
  "pointer-events-none absolute left-0 top-1 text-xs font-medium text-subtle transition-all peer-placeholder-shown:top-5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-xs peer-focus:text-accent";

export default function ContactForm() {
  const submit = useMutation(api.contact.submit);
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", message: "", company: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast("All fields are required", "error");
      return;
    }
    setLoading(true);
    try {
      await submit(form);
      setSent(true);
    } catch (err) {
      toast(friendlyError(err, "Couldn't send message"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="contact" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border-muted shadow-lg md:grid-cols-2">
          {/* Left panel */}
          <div className="relative flex flex-col justify-between overflow-hidden bg-accent p-10">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10" />
            <div className="relative z-10">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent-foreground/70">
                Get In Touch
              </p>
              <h2 className="mb-4 text-3xl font-bold leading-snug text-accent-foreground">
                Have a suggestion or request?
              </h2>
              <p className="text-sm leading-relaxed text-accent-foreground/80">
                Tell us about a game you&apos;d like to see added, share feedback, or
                just say hi. We read every message.
              </p>
            </div>
            <div className="relative z-10 mt-10 space-y-3">
              {["Request a new game", "Report an issue", "Partnership inquiry"].map(
                (item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2.5 text-sm text-accent-foreground/90"
                  >
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-foreground" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Right panel — form */}
          <div className="flex flex-col justify-center bg-surface p-10">
            {sent ? (
              <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                <div className="text-5xl">✅</div>
                <h3 className="text-xl font-bold">Message sent!</h3>
                <p className="text-sm text-muted">
                  Thanks for reaching out. We&apos;ll get back to you soon.
                </p>
                <button
                  onClick={() => {
                    setForm({ name: "", email: "", message: "", company: "" });
                    setSent(false);
                  }}
                  className="mt-2 text-sm font-medium text-accent hover:underline"
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                <input type="text" name="company" className="hidden" onChange={change} />
                <div className="relative">
                  <input type="text" name="name" id="cf-name" placeholder="Full Name" value={form.name} onChange={change} className={fieldClass} />
                  <label htmlFor="cf-name" className={labelClass}>Full Name</label>
                </div>
                <div className="relative">
                  <input type="email" name="email" id="cf-email" placeholder="Email Address" value={form.email} onChange={change} className={fieldClass} />
                  <label htmlFor="cf-email" className={labelClass}>Email Address</label>
                </div>
                <div className="relative">
                  <textarea name="message" id="cf-message" placeholder="Your message" value={form.message} onChange={change} rows={4} className={`${fieldClass} resize-none`} />
                  <label htmlFor="cf-message" className={labelClass}>Your message</label>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <span>✉️</span>
                  )}
                  {loading ? "Sending…" : "Send message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
