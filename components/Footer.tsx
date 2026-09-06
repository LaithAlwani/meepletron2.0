import Link from "next/link";

const socials = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61572349896501",
    path: "M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.378 14.192 5 15.115 5H18V0h-3.808C10.596 0 9 1.583 9 4.615V8z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/meeple_tron/",
    path: "M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.6 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1s-3.6 0-4.9-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.3 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.1 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 3.4a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8zm0 10.5a4.1 4.1 0 1 1 0-8.2 4.1 4.1 0 0 1 0 8.2zm6.6-10.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/",
    path: "M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.4 12 31 31 0 0 0 23 7.5zM9.75 15.5v-7l6 3.5-6 3.5z",
  },
  {
    label: "X",
    href: "https://x.com/meepletron45657",
    path: "M18.9 2H22l-7.1 8.1L23.3 22h-6.6l-5.2-6.8L5.5 22H2.4l7.6-8.7L1 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.2 3.8H5.3L17.7 20z",
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border bg-background px-4 py-12">
      <div className="mx-auto max-w-xl text-center">
        <div className="mb-4 flex justify-center gap-5">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={s.label}
              className="text-muted transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d={s.path} />
              </svg>
            </a>
          ))}
        </div>
        <nav className="mb-3">
          <ul className="flex justify-center gap-4 text-sm">
            <li>
              <Link
                href="/privacy"
                className="text-muted underline transition-colors hover:text-foreground"
              >
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-muted underline transition-colors hover:text-foreground"
              >
                Terms of Service
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-xs text-muted">
          © 2026 Meepletron • All rights reserved
        </p>
      </div>
    </footer>
  );
}
