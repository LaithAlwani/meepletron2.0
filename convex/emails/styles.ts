import * as React from "react";
import { colors } from "./theme";

/** Shared text + button styles so the templates read consistently. */
export const h1: React.CSSProperties = {
  margin: "0 0 14px 0",
  fontSize: "22px",
  lineHeight: "1.3",
  color: colors.ink,
  fontWeight: 700,
  letterSpacing: "-0.01em",
};

export const paragraph: React.CSSProperties = {
  margin: "0 0 14px 0",
  fontSize: "15px",
  lineHeight: "1.6",
  color: colors.body,
};

export const small: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  lineHeight: "1.5",
  color: colors.muted,
};

export const strong: React.CSSProperties = {
  color: colors.ink,
  fontWeight: 700,
};

export const link: React.CSSProperties = {
  color: colors.brand,
  textDecoration: "none",
  fontWeight: 600,
};

export const buttonWrap: React.CSSProperties = {
  margin: "6px 0 22px 0",
};

export const button: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: colors.brand,
  color: colors.white,
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  padding: "13px 28px",
  borderRadius: "10px",
};
