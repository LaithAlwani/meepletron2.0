import * as React from "react";
import { Heading, Text, Section, Button } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { h1, paragraph, small, strong, button, buttonWrap } from "./styles";

export type PlayTagEmailProps = {
  ownerName: string;
  playTitle: string;
  playUrl: string;
  recipientName?: string;
};

/** "{owner} added you to a game night" — sent to a tagged, non-account player. */
export function PlayTagEmail({
  ownerName,
  playTitle,
  playUrl,
  recipientName,
}: PlayTagEmailProps) {
  const hello = recipientName?.trim() ? `Hi ${recipientName.trim()},` : "Hi there,";
  return (
    <EmailLayout
      preview={`${ownerName} added you to a play of ${playTitle}`}
      footerNote={`You're receiving this because ${ownerName} logged a game with your email on Meepletron.`}
    >
      <Heading style={h1}>{ownerName} added you to a game night 🎲</Heading>
      <Text style={paragraph}>{hello}</Text>
      <Text style={paragraph}>
        <span style={strong}>{ownerName}</span> logged a play of{" "}
        <span style={strong}>{playTitle}</span> on Meepletron and added you as one
        of the players.
      </Text>
      <Text style={paragraph}>
        Head over to see the scores, who won, and the photos from the table.
      </Text>

      <Section style={buttonWrap}>
        <Button href={playUrl} style={button}>
          See the play
        </Button>
      </Section>

      <Text style={small}>
        Sign in with this email address to keep every game you&apos;re tagged in —
        and log your own.
      </Text>
    </EmailLayout>
  );
}

export default PlayTagEmail;
