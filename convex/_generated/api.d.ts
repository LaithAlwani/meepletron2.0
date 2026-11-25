/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as bgg from "../bgg.js";
import type * as bggSync from "../bggSync.js";
import type * as chat from "../chat.js";
import type * as chunkMigration from "../chunkMigration.js";
import type * as collection from "../collection.js";
import type * as contact from "../contact.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as emails_ContactAdminEmail from "../emails/ContactAdminEmail.js";
import type * as emails_ContactAutoReplyEmail from "../emails/ContactAutoReplyEmail.js";
import type * as emails_EmailLayout from "../emails/EmailLayout.js";
import type * as emails_NotificationEmail from "../emails/NotificationEmail.js";
import type * as emails_VerificationCodeEmail from "../emails/VerificationCodeEmail.js";
import type * as emails_styles from "../emails/styles.js";
import type * as emails_theme from "../emails/theme.js";
import type * as faqs from "../faqs.js";
import type * as games from "../games.js";
import type * as glossary from "../glossary.js";
import type * as guest from "../guest.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as ingestion from "../ingestion.js";
import type * as ingestionDb from "../ingestionDb.js";
import type * as lib_aiModels from "../lib/aiModels.js";
import type * as lib_annotations from "../lib/annotations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bggCrypto from "../lib/bggCrypto.js";
import type * as lib_bggFetch from "../lib/bggFetch.js";
import type * as lib_bggStats from "../lib/bggStats.js";
import type * as lib_bggSyncTypes from "../lib/bggSyncTypes.js";
import type * as lib_bggThing from "../lib/bggThing.js";
import type * as lib_bggXml from "../lib/bggXml.js";
import type * as lib_chatConfig from "../lib/chatConfig.js";
import type * as lib_chunker from "../lib/chunker.js";
import type * as lib_chunks from "../lib/chunks.js";
import type * as lib_embedding from "../lib/embedding.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as lib_gameCover from "../lib/gameCover.js";
import type * as lib_gameFilters from "../lib/gameFilters.js";
import type * as lib_gameSearch from "../lib/gameSearch.js";
import type * as lib_gameSort from "../lib/gameSort.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_num from "../lib/num.js";
import type * as lib_pdf from "../lib/pdf.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_purge from "../lib/purge.js";
import type * as lib_r2keys from "../lib/r2keys.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_stats from "../lib/stats.js";
import type * as lib_topGamesCategories from "../lib/topGamesCategories.js";
import type * as lib_userTotals from "../lib/userTotals.js";
import type * as maintenance from "../maintenance.js";
import type * as otp_EmailOtp from "../otp/EmailOtp.js";
import type * as r2 from "../r2.js";
import type * as rag from "../rag.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reminders from "../reminders.js";
import type * as rulebookRequests from "../rulebookRequests.js";
import type * as rulebooks from "../rulebooks.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as seedRag from "../seedRag.js";
import type * as siteConfig from "../siteConfig.js";
import type * as topGames from "../topGames.js";
import type * as tuckboxes from "../tuckboxes.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  bgg: typeof bgg;
  bggSync: typeof bggSync;
  chat: typeof chat;
  chunkMigration: typeof chunkMigration;
  collection: typeof collection;
  contact: typeof contact;
  crons: typeof crons;
  email: typeof email;
  "emails/ContactAdminEmail": typeof emails_ContactAdminEmail;
  "emails/ContactAutoReplyEmail": typeof emails_ContactAutoReplyEmail;
  "emails/EmailLayout": typeof emails_EmailLayout;
  "emails/NotificationEmail": typeof emails_NotificationEmail;
  "emails/VerificationCodeEmail": typeof emails_VerificationCodeEmail;
  "emails/styles": typeof emails_styles;
  "emails/theme": typeof emails_theme;
  faqs: typeof faqs;
  games: typeof games;
  glossary: typeof glossary;
  guest: typeof guest;
  http: typeof http;
  images: typeof images;
  ingestion: typeof ingestion;
  ingestionDb: typeof ingestionDb;
  "lib/aiModels": typeof lib_aiModels;
  "lib/annotations": typeof lib_annotations;
  "lib/auth": typeof lib_auth;
  "lib/bggCrypto": typeof lib_bggCrypto;
  "lib/bggFetch": typeof lib_bggFetch;
  "lib/bggStats": typeof lib_bggStats;
  "lib/bggSyncTypes": typeof lib_bggSyncTypes;
  "lib/bggThing": typeof lib_bggThing;
  "lib/bggXml": typeof lib_bggXml;
  "lib/chatConfig": typeof lib_chatConfig;
  "lib/chunker": typeof lib_chunker;
  "lib/chunks": typeof lib_chunks;
  "lib/embedding": typeof lib_embedding;
  "lib/extraction": typeof lib_extraction;
  "lib/gameCover": typeof lib_gameCover;
  "lib/gameFilters": typeof lib_gameFilters;
  "lib/gameSearch": typeof lib_gameSearch;
  "lib/gameSort": typeof lib_gameSort;
  "lib/media": typeof lib_media;
  "lib/num": typeof lib_num;
  "lib/pdf": typeof lib_pdf;
  "lib/pricing": typeof lib_pricing;
  "lib/prompts": typeof lib_prompts;
  "lib/purge": typeof lib_purge;
  "lib/r2keys": typeof lib_r2keys;
  "lib/slug": typeof lib_slug;
  "lib/stats": typeof lib_stats;
  "lib/topGamesCategories": typeof lib_topGamesCategories;
  "lib/userTotals": typeof lib_userTotals;
  maintenance: typeof maintenance;
  "otp/EmailOtp": typeof otp_EmailOtp;
  r2: typeof r2;
  rag: typeof rag;
  rateLimit: typeof rateLimit;
  reminders: typeof reminders;
  rulebookRequests: typeof rulebookRequests;
  rulebooks: typeof rulebooks;
  search: typeof search;
  seed: typeof seed;
  seedRag: typeof seedRag;
  siteConfig: typeof siteConfig;
  topGames: typeof topGames;
  tuckboxes: typeof tuckboxes;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
