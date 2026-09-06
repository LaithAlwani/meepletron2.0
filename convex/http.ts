import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { streamText } from "ai";
import { auth } from "./auth";
import { finite } from "./lib/num";
import { CHAT_MODEL, buildAnswer } from "./rag";

const http = httpRouter();

// Convex Auth routes (/api/auth/*).
auth.addHttpRoutes(http);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Stream a fixed message (and persist it) when there's nothing to retrieve. */
function staticAnswer(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  origin: string | null,
  text: string,
  save: () => Promise<unknown>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(text));
      // Persist BEFORE closing so the reactive query has the saved message by
      // the time the client sees the stream end (otherwise it flashes and
      // disappears, or never appears at all).
      await save();
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
  });
}

const chat = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", {
      status: 401,
      headers: corsHeaders(origin),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400, headers: corsHeaders(origin) });
  }
  const rawChatId = (body as { chatId?: unknown })?.chatId;
  if (typeof rawChatId !== "string") {
    return new Response("Missing chatId", { status: 400, headers: corsHeaders(origin) });
  }
  const chatId = rawChatId as Id<"chats">;

  const { selectedRulebookIds, hasIngested, query, history, sourceTitles } =
    await ctx.runQuery(internal.chat.getStreamContext, { chatId, userId });

  if (!query) {
    return new Response("No question found", {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  // No resource to answer from → reply with a prompt, and NEVER call the model
  // (so it costs no tokens and doesn't count against the daily budget).
  if (selectedRulebookIds.length === 0) {
    const text = hasIngested
      ? "You haven't selected a resource to chat with. Open Resources and choose at least one rulebook, then ask your question again."
      : "I don't have the proper information to answer that yet — this game's rulebook hasn't been added to Meepletron. Please reach out to customer support so we can get the manual added.";
    return staticAnswer(ctx, origin, text, () =>
      ctx.runMutation(internal.chat.saveAssistantMessage, {
        chatId,
        userId,
        content: text,
        annotations: [],
        usage: [],
      }),
    );
  }

  // Daily budget — reset window / reject if over. Reserved only now that we're
  // committed to actually generating an answer.
  try {
    await ctx.runMutation(internal.chat.reserveBudget, {
      userId,
      todayStartMs: startOfUtcDay(Date.now()),
    });
  } catch {
    return new Response(
      "You've reached today's message limit. Please try again tomorrow.",
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  const messages = history as { role: "user" | "assistant"; content: string }[];

  // Retrieve + rerank + assemble the grounded prompt (shared with the FAQ generator).
  const { system, annotations, usage, empty, answerTemperature } =
    await buildAnswer(ctx, {
      rulebookIds: selectedRulebookIds,
      query,
      history: messages,
      sourceTitles,
    });

  // No relevant rulebook content → tell the user, and NEVER let the model
  // answer from its own knowledge.
  if (empty || !system) {
    const text =
      "I couldn't find anything about that in the loaded rulebook(s). I only answer from what's in the rulebook, so try rephrasing using the game's own terms — for example the phase, action, or component involved — or it may not be covered here.";
    return staticAnswer(ctx, origin, text, () =>
      ctx.runMutation(internal.chat.saveAssistantMessage, {
        chatId,
        userId,
        content: text,
        annotations: [],
        usage,
      }),
    );
  }

  // Stream the grounded answer; persist on completion.
  const result = streamText({
    model: CHAT_MODEL,
    system,
    messages,
    temperature: answerTemperature,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const delta of result.textStream) {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        }
        const answerUsage = await result.usage;
        const inTok = finite(answerUsage.inputTokens);
        const outTok = finite(answerUsage.outputTokens);
        usage.push({
          purpose: "chat-answer",
          model: "gemini-2.5-flash",
          promptTokens: inTok,
          completionTokens: outTok,
          totalTokens: finite(answerUsage.totalTokens) || inTok + outTok,
        });
      } catch {
        if (!full) full = "Sorry — something went wrong generating the answer.";
      }
      // Persist BEFORE closing the stream so the reactive query has the saved
      // message by the time the client sees the stream end (no flicker).
      try {
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
          chatId,
          userId,
          content: full,
          annotations,
          usage,
        });
      } catch {
        // Best-effort persistence; the streamed text already reached the client.
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
  });
});

http.route({ path: "/chat", method: "POST", handler: chat });
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("Origin")),
    });
  }),
});

export default http;
