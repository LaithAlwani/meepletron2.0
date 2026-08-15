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
import type * as contact from "../contact.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as faqs from "../faqs.js";
import type * as favorites from "../favorites.js";
import type * as files from "../files.js";
import type * as games from "../games.js";
import type * as glossary from "../glossary.js";
import type * as guest from "../guest.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as ingestion from "../ingestion.js";
import type * as ingestionDb from "../ingestionDb.js";
import type * as lib_annotations from "../lib/annotations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bggCrypto from "../lib/bggCrypto.js";
import type * as lib_bggFetch from "../lib/bggFetch.js";
import type * as lib_bggStats from "../lib/bggStats.js";
import type * as lib_bggSyncTypes from "../lib/bggSyncTypes.js";
import type * as lib_bggXml from "../lib/bggXml.js";
import type * as lib_chatReady from "../lib/chatReady.js";
import type * as lib_chunker from "../lib/chunker.js";
import type * as lib_embedding from "../lib/embedding.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as lib_gameSearch from "../lib/gameSearch.js";
import type * as lib_num from "../lib/num.js";
import type * as lib_pdf from "../lib/pdf.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_purge from "../lib/purge.js";
import type * as lib_slug from "../lib/slug.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations from "../migrations.js";
import type * as rag from "../rag.js";
import type * as reminders from "../reminders.js";
import type * as rulebooks from "../rulebooks.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as seedRag from "../seedRag.js";
import type * as siteConfig from "../siteConfig.js";
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
  contact: typeof contact;
  crons: typeof crons;
  email: typeof email;
  faqs: typeof faqs;
  favorites: typeof favorites;
  files: typeof files;
  games: typeof games;
  glossary: typeof glossary;
  guest: typeof guest;
  http: typeof http;
  images: typeof images;
  ingestion: typeof ingestion;
  ingestionDb: typeof ingestionDb;
  "lib/annotations": typeof lib_annotations;
  "lib/auth": typeof lib_auth;
  "lib/bggCrypto": typeof lib_bggCrypto;
  "lib/bggFetch": typeof lib_bggFetch;
  "lib/bggStats": typeof lib_bggStats;
  "lib/bggSyncTypes": typeof lib_bggSyncTypes;
  "lib/bggXml": typeof lib_bggXml;
  "lib/chatReady": typeof lib_chatReady;
  "lib/chunker": typeof lib_chunker;
  "lib/embedding": typeof lib_embedding;
  "lib/extraction": typeof lib_extraction;
  "lib/gameSearch": typeof lib_gameSearch;
  "lib/num": typeof lib_num;
  "lib/pdf": typeof lib_pdf;
  "lib/prompts": typeof lib_prompts;
  "lib/purge": typeof lib_purge;
  "lib/slug": typeof lib_slug;
  maintenance: typeof maintenance;
  migrations: typeof migrations;
  rag: typeof rag;
  reminders: typeof reminders;
  rulebooks: typeof rulebooks;
  search: typeof search;
  seed: typeof seed;
  seedRag: typeof seedRag;
  siteConfig: typeof siteConfig;
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

export declare const components: {};
