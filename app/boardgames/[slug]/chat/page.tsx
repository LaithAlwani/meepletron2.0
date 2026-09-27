"use client";

import { use } from "react";
import { ChatPane } from "@/components/chat/ChatPane";

export default function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <ChatPane slug={slug} />;
}
