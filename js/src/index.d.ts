// Types of the reference reader of the `.kpin` list format 1.x (reader rules of revision 2026-11).

/** The one answer a reader gives for a file. */
export type AnswerName = "ready" | "not_a_list" | "needs_newer_app" | "other_app" | "too_big" | "empty";

/** A file that is a list: what was read out of it. */
export interface Ready {
  answer: "ready";
  list: List;
}
/** A list for another Koona app, named by its `app`. */
export interface OtherApp {
  answer: "other_app";
  app: string;
  /** Why, in a few words, for a person. Not part of the format: do not match on it. */
  why: string;
}
/** Any other refusal. */
export interface Refused {
  answer: "not_a_list" | "needs_newer_app" | "too_big" | "empty";
  /** Why, in a few words, for a person. Not part of the format: do not match on it. */
  why: string;
}
export type Answer = Ready | OtherApp | Refused;

/** What a reader reads out of a list, as the conformance suite's `list` names it. */
export interface List {
  /** The list's title, cleaned and cut to 120 characters. */
  title: string;
  /** `"MAJOR.MINOR"` as the file writes it. */
  version: string;
  /** The file's MINOR is newer than 1.0: unknown fields were counted and skipped. */
  newer: boolean;
  /** How many sections have a name. */
  sections: number;
  meta: Meta;
  counts: Counts;
  /** In the file's order: each entry of `sections` in order, then the top-level items. */
  links: Link[];
  feeds: Feed[];
  /** Every item and detail skipped, and why, in the file's order. Not tested by the suite. */
  skipped: Skip[];
}

export interface Meta {
  description: string | null;
  /** `null` when neither the name nor the address is valid. */
  author: { name: string | null; url: string | null } | null;
  license: string | null;
  language: string | null;
  updated: string | null;
  homepage: string | null;
  id: string | null;
  generator: string | null;
}

export interface Counts {
  links: number;
  feeds: number;
  /** Links and feeds whose page came earlier in the file, in one count. */
  repeated: number;
  not_web: number;
  invalid: number;
  /** Items of an unknown type, or not objects. */
  skipped_items: number;
  /** Unknown fields, counted only in a newer MINOR. */
  skipped_details: number;
}

export interface Link {
  /** As kept: as written, or the parsed form (see the spec's Addresses). */
  url: string;
  title: string | null;
  description: string | null;
  /** Lowercased and cleaned, at most 20, with the tags of its repeats. */
  tags: string[];
  /** The names of the sections it is in, its first one first. */
  sections: string[];
}

export interface Feed {
  /** In its parsed form. */
  url: string;
  title: string | null;
  site: string | null;
  section: string | null;
}

export interface Skip {
  /** Where in the file: `items[3]`, `sections[0].items[1]`, `author`, or `""` for the list itself. */
  at: string;
  reason: "repeated" | "not_web" | "invalid" | "unknown_type" | "not_an_object" | "unknown_field";
  /** The address, for a link or feed skipped for it. */
  url?: string;
  /** The unknown item's `type`, when it is a string. */
  type?: string;
  /** The unknown field's name. */
  field?: string;
}

/** Reads a `.kpin` file: its text, or its bytes as they came (bytes that are not UTF-8 are not a list). */
export function read(input: string | Uint8Array | ArrayBuffer | SharedArrayBuffer | ArrayBufferView): Answer;

/** A one-line field (titles, names, `author.name`, `license`, `generator`) cleaned and cut to `max` characters; `null` when nothing is left. */
export function line(raw: string, max: number): string | null;
/** A description cleaned, its line breaks kept, and cut to `max` characters (2,000 by default); `null` when nothing is left. */
export function description(raw: string, max?: number): string | null;
/** A tag: lowercased, one line, at most 64 characters; `null` when nothing is left. */
export function tag(raw: string): string | null;
/** The text without the invisible characters that are not seen (the flags and the joiners that stay are kept). */
export function withoutInvisible(raw: string): string;
/** Whether one character (a code point) is on the spec's list of invisible characters. */
export function isInvisible(c: string): boolean;
/** Whether a joiner (U+200D) or non-joiner (U+200C) stays between `before` and `after`. */
export function joinerStays(joiner: string, before: string | undefined, after: string | undefined): boolean;
/** Unicode White_Space trimmed off both ends. */
export function trimWhiteSpace(text: string): string;

export type Taken = { url: string } | { skip: "invalid" | "not_web" };
/** A link's address as kept, or why the link is skipped. */
export function linkUrl(raw: string): Taken;
/** A feed's address in its parsed form, or why the feed is skipped. */
export function feedUrl(raw: string): Taken;
/** A web address (`homepage`, `author.url`, a feed's `site`), or `null` when the field is dropped. */
export function webAddress(raw: unknown): string | null;
/** Whether a feed may be on this host (a WHATWG `hostname`). */
export function publicHost(hostname: string): boolean;
/** The repeat key of an address: equal keys are the same page. `null` for an address that is not http(s). */
export function repeatKey(raw: string): string | null;
/** The list address a `koonapin://import?url=…` link offers to download, or `null` when it is ignored. */
export function oneClick(link: string): string | null;

export const MAX_BYTES: number;
/** Arrays and objects nest at most 127 levels deep, the file's object being the first. */
export const MAX_DEPTH: number;
export const MAX_ITEMS: number;
export const MAX_SECTIONS: number;
export const TAGS_PER_LINK: number;
export const READER_MAJOR: number;
export const READER_MINOR: number;
export const TITLE_LEN: number;
export const ITEM_TITLE_LEN: number;
export const DESCRIPTION_LEN: number;
export const TAG_LEN: number;
export const LICENSE_LEN: number;
export const GENERATOR_LEN: number;
export const URL_BYTES: number;
export const LINK_BYTES: number;
export const JOINING_SCRIPTS: readonly string[];
/** The revision of the reader rules this reader follows: `"2026-11"`. */
export const REVISION: string;
/** The version of the format whose fields this reader knows: `"1.0"`. */
export const SPEC: string;
