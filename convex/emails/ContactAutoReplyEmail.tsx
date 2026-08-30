import * as React from "react";
import { Heading, Text, Section, Button, Link } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { SITE_URL } from "./theme";
import { h1, paragraph, small, link, button, buttonWrap } from "./styles";

export type ContactAutoReplyEmailProps = {
  name: string;
  siteUrl?: string;
};

/** Friendly auto-reply to the visitor. Reply-To is set to support@ on the send,
 *  so if they reply it reaches a human. */
export function ContactAutoReplyEmail({
  name,
  siteUrl = SITE_URL,
}: ContactAutoReplyEmailProps) {
  return (
    <EmailLayout
      preview="Thanks for reaching out — we got your message."
      footerNote="You're receiving this because you contacted Meepletron. If this wasn't you, you can safely ignore it."
    >
      <Heading style={h1}>Thanks for reaching out, {name}!</Heading>
      <Text style={paragraph}>
        We&apos;ve received your message and we&apos;ll get back to you as soon as
        we can — usually within a day or two.
      </Text>
      <Text style={paragraph}>
        In the meantime, keep exploring games, logging plays, and sharing your
        board game nights at{" "}
        <Link href={siteUrl} style={link}>
          meepletron.com
        </Link>
        .
      </Text>

      <Section style={buttonWrap}>
        <Button href={`${siteUrl}/boardgames`} style={button}>
          Browse board games
        </Button>
      </Section>

      <Text style={small}>— The Meepletron team</Text>
    </EmailLayout>
  );
}

export default ContactAutoReplyEmail;
