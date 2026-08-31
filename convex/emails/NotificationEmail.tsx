import * as React from "react";
import { Heading, Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { h1, paragraph, small, button, buttonWrap } from "./styles";

export type NotificationEmailProps = {
  recipientName?: string;
  /** The headline, e.g. "alex sent you a friend request". */
  heading: string;
  /** Optional body line (e.g. a comment snippet). */
  body?: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Footer note explaining why they got this + how to turn it off. */
  footerNote: string;
};

/** A generic transactional nudge (friend request / comment / mention). */
export function NotificationEmail({
  recipientName,
  heading,
  body,
  ctaLabel,
  ctaUrl,
  footerNote,
}: NotificationEmailProps) {
  const hello = recipientName?.trim() ? `Hi ${recipientName.trim()},` : "Hi there,";
  return (
    <EmailLayout preview={heading} footerNote={footerNote}>
      <Heading style={h1}>{heading}</Heading>
      <Text style={paragraph}>{hello}</Text>
      {body ? <Text style={paragraph}>{body}</Text> : null}
      <Section style={buttonWrap}>
        <Button href={ctaUrl} style={button}>
          {ctaLabel}
        </Button>
      </Section>
      <Text style={small}>
        You can turn these emails off any time in your Meepletron settings.
      </Text>
    </EmailLayout>
  );
}

export default NotificationEmail;
