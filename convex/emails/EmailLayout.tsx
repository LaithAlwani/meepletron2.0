import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Link,
  Text,
  Hr,
} from "@react-email/components";
import { colors, fontStack, SITE_URL, LOGO_URL, TAGLINE } from "./theme";

export type EmailLayoutProps = {
  /** Hidden preheader text shown in the inbox list. */
  preview: string;
  /** Small note in the footer explaining why they got this email. */
  footerNote?: string;
  children: React.ReactNode;
};

/**
 * The shared shell for every Meepletron email — a cream canvas with a centered
 * white card: a tangerine accent bar, the logo header, the body slot, and a
 * branded footer. All styles inline for cross-client rendering.
 */
export function EmailLayout({
  preview,
  footerNote = "You're receiving this because you have an account or interacted with Meepletron.",
  children,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={outer}>
          <Container style={card}>
            {/* Tangerine accent bar */}
            <Section style={accentBar} />

            {/* Logo header */}
            <Section style={header}>
              <Link href={SITE_URL}>
                <Img
                  src={LOGO_URL}
                  alt="Meepletron"
                  width="196"
                  height="86"
                  style={logo}
                />
              </Link>
            </Section>

            {/* Body */}
            <Section style={content}>{children}</Section>

            {/* Footer */}
            <Hr style={divider} />
            <Section style={footer}>
              <Text style={footerBrand}>
                <Link href={SITE_URL} style={footerBrandLink}>
                  Meepletron
                </Link>{" "}
                · {TAGLINE}
              </Text>
              <Text style={footerNoteStyle}>{footerNote}</Text>
            </Section>
          </Container>
        </Container>
      </Body>
    </Html>
  );
}

/* ---- styles ---- */
const main: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: colors.bg,
  fontFamily: fontStack,
  color: colors.body,
  WebkitFontSmoothing: "antialiased",
};

const outer: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  padding: "32px 12px",
};

const card: React.CSSProperties = {
  maxWidth: "600px",
  width: "100%",
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "16px",
  overflow: "hidden",
};

const accentBar: React.CSSProperties = {
  height: "4px",
  backgroundColor: colors.brand,
  lineHeight: "4px",
  fontSize: "1px",
};

const header: React.CSSProperties = {
  padding: "28px 32px 12px 32px",
  textAlign: "center",
};

const logo: React.CSSProperties = {
  display: "inline-block",
  width: "196px",
  height: "auto",
  maxWidth: "70%",
};

const content: React.CSSProperties = {
  padding: "12px 32px 8px 32px",
  color: colors.body,
  fontSize: "15px",
  lineHeight: "1.6",
};

const divider: React.CSSProperties = {
  borderColor: colors.border,
  margin: "24px 32px 0 32px",
  width: "auto",
};

const footer: React.CSSProperties = {
  padding: "16px 32px 28px 32px",
  color: colors.muted,
  fontSize: "12px",
  lineHeight: "1.5",
};

const footerBrand: React.CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: "12px",
  color: colors.muted,
};

const footerBrandLink: React.CSSProperties = {
  color: colors.brand,
  textDecoration: "none",
  fontWeight: 700,
};

const footerNoteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  color: colors.subtle,
};
