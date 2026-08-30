import * as React from "react";
import { Heading, Text, Section } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { colors, monoStack } from "./theme";
import { h1, paragraph, small } from "./styles";

export type VerificationCodeEmailProps = { code: string };

/** One-time sign-in code (Password provider email verification). */
export function VerificationCodeEmail({ code }: VerificationCodeEmailProps) {
  return (
    <EmailLayout
      preview={`Your Meepletron code is ${code}`}
      footerNote="You're receiving this because this email was used to sign in to Meepletron. Didn't try to sign in? You can safely ignore it."
    >
      <Heading style={h1}>Confirm your email</Heading>
      <Text style={paragraph}>
        Enter this code to finish signing in to Meepletron. It expires in 15
        minutes.
      </Text>

      <Section style={codeBox}>
        <Text style={codeText}>{code}</Text>
      </Section>

      <Text style={small}>
        If you didn&apos;t try to sign in, you can safely ignore this email — no
        changes will be made to your account.
      </Text>
    </EmailLayout>
  );
}

const codeBox: React.CSSProperties = {
  margin: "4px 0 20px 0",
  padding: "18px 0",
  textAlign: "center",
  border: `1px solid ${colors.border}`,
  borderRadius: "12px",
  backgroundColor: colors.bg,
};

const codeText: React.CSSProperties = {
  margin: 0,
  fontSize: "34px",
  fontWeight: 800,
  letterSpacing: "10px",
  color: colors.ink,
  fontFamily: monoStack,
};

export default VerificationCodeEmail;
