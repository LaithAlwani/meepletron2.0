"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal wrapper over the browser Web Speech API (`SpeechRecognition`) for
 * dictation into a text field. No dependency, no server. `supported` is false in
 * browsers without it (e.g. Firefox), so callers can hide the mic. `onText` gets
 * the running transcript of the current dictation; the caller decides how to
 * merge it with any already-typed text.
 */

type Alt = { transcript: string };
type ResultItem = ArrayLike<Alt> & { isFinal: boolean };
type SREvent = { resultIndex: number; results: ArrayLike<ResultItem> };
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onText: (transcript: string) => void): {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
} {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    // Defer so we don't setState synchronously in the effect body.
    const id = requestAnimationFrame(() => setSupported(getCtor() !== null));
    return () => {
      cancelAnimationFrame(id);
      recRef.current?.abort();
    };
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const item = e.results[i];
        const t = item[0]?.transcript ?? "";
        if (item.isFinal) finalText += t;
        else interim += t;
      }
      onTextRef.current((finalText + interim).trim());
    };
    const stop = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onend = stop;
    rec.onerror = stop;
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      stop();
    }
  }, []);

  return { supported, listening, toggle };
}
