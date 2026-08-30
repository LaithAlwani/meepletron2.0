import * as React from "react";
import { Heading, Text, Section, Link } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { colors } from "./theme";
import { h1, strong } from "./styles";

export type ContactAdminEmailProps = {
  name: string;
  email: string;
  message: string;
};

/** Notification to support when someone submits the contact form. Reply-To is
 *  set to the visitor on the send, so hitting Reply drafts straight to them. */
export function ContactAdminEmail({
  name,
  email,
  message,
}: ContactAdminEmailProps) {
  return (
    <EmailLayout
      preview={`New message from ${name}`}
      footerNote="Sent from the Meepletron contact form."
    >
      <Heading style={h1}>New contact form submission</Heading>
      <Text style={intro}>
        Hit Reply to respond directly to <span style={strong}>{name}</span>.
      </Text>

      <Section style={cardBox}>
        <div style={rowTop}>
          <Text style={label}>From</Text>
          <Text style={fromName}>{name}</Text>
          <Text style={fromEmail}>
            <Link href={`mailto:${email}`} style={emailLink}>
              {email}
            </Link>
          </Text>
        </div>
        <div style={rowBottom}>
          <Text style={label}>Message</Text>
          <Text style={messageText}>{message}</Text>
        </div>
      </Section>
    </EmailLayout>
  );
}

const intro: React.CSSProperties = {
  margin: "0 0 20px 0",
  fontSize: "15px",
  lineHeight: "1.6",
  color: colors.muted,
};

const cardBox: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: "12px",
  backgroundColor: colors.bg,
  overflow: "hidden",
};

const rowTop: React.CSSProperties = {
  padding: "14px 18px",
  borderBottom: `1px solid ${colors.border}`,
};

const rowBottom: React.CSSProperties = {
  padding: "14px 18px",
};

const label: React.CSSProperties = {
  margin: 0,
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: colors.muted,
  fontWeight: 700,
};

const fromName: React.CSSProperties = {
  margin: "4px 0 0 0",
  fontSize: "15px",
  color: colors.ink,
  fontWeight: 600,
};

const fromEmail: React.CSSProperties = {
  margin: "2px 0 0 0",
  fontSize: "13px",
  color: colors.body,
};

const emailLink: React.CSSProperties = {
  color: colors.brand,
  textDecoration: "none",
};

const messageText: React.CSSProperties = {
  margin: "8px 0 0 0",
  fontSize: "15px",
  lineHeight: "1.6",
  color: colors.body,
  whiteSpace: "pre-wrap",
};

export default ContactAdminEmail;
