// Reading a `.kpin` file as the spec's "How a reader answers a file" and "Payload of pin / list"
// say: one answer per file, then the metadata, sections, links and feeds, with what was skipped
// counted. A reader of 1.0: it knows MINOR 0.
import { line, description, tag, TITLE_LEN, ITEM_TITLE_LEN, DESCRIPTION_LEN, LICENSE_LEN, GENERATOR_LEN } from "./text.js";
import { linkUrl, feedUrl, webAddress, repeatKey, utf8Length } from "./address.js";

/** A file is at most 2 MB, checked before it is parsed. */
export const MAX_BYTES = 2 * 1024 * 1024;
/** Items across all sections and the top level. */
export const MAX_ITEMS = 5000;
/** Entries of `sections`, with a name or without. */
export const MAX_SECTIONS = 200;
/** Tags per link, with those of its repeats. */
export const TAGS_PER_LINK = 20;
/** The version this reader knows. */
export const READER_MAJOR = 1;
export const READER_MINOR = 0;

const AUTHOR_LEN = 120;
const SECTION_LEN = 120;
const ID_LEN = 64;

const ENVELOPE_KEYS = new Set(["$schema", "format", "app", "kind", "version", "generator", "id", "title", "description", "author", "license", "language", "updated", "homepage", "sections", "items"]);
const AUTHOR_KEYS = new Set(["name", "url"]);
const SECTION_KEYS = new Set(["name", "items"]);
const LINK_KEYS = new Set(["type", "url", "title", "description", "tags"]);
const FEED_KEYS = new Set(["type", "url", "site", "title"]);

class Refusal {
  constructor(answer, why, app) {
    this.answer = answer;
    this.why = why;
    this.app = app;
  }
}
const refuse = (answer, why, app) => {
  throw new Refusal(answer, why, app);
};

const own = (object, key) => (Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const string = (object, key) => {
  const value = own(object, key);
  return typeof value === "string" ? value : undefined;
};
const textOf = (object, key, max) => {
  const value = string(object, key);
  return value === undefined ? null : line(value, max);
};

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Whether every string of a parsed JSON value, keys included, is Unicode text. */
function wellFormed(value) {
  const stack = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === "string") {
      if (LONE_SURROGATE.test(v)) return false;
    } else if (Array.isArray(v)) {
      stack.push(...v);
    } else if (v !== null && typeof v === "object") {
      for (const key of Object.keys(v)) {
        if (LONE_SURROGATE.test(key)) return false;
        stack.push(v[key]);
      }
    }
  }
  return true;
}

/** `[a-z][a-z0-9-]{0,31}`: `app` and `kind`. */
const isName = (s) => /^[a-z][a-z0-9-]{0,31}$/.test(s);
/** A plain decimal number: no sign, no leading zero (`0` alone is fine). */
const isPlain = (s) => /^(0|[1-9][0-9]*)$/.test(s);

/** `[MAJOR, MINOR]` of a version this reader opens; refuses any other. */
function version(raw) {
  const dot = raw.indexOf(".");
  if (dot < 0) refuse("not_a_list", `version ${JSON.stringify(raw)} is not MAJOR.MINOR`);
  const major = raw.slice(0, dot);
  const minor = raw.slice(dot + 1);
  if (!isPlain(major) || !isPlain(minor)) refuse("not_a_list", `version ${JSON.stringify(raw)} is not MAJOR.MINOR`);
  if (major === "0") refuse("not_a_list", "there is no MAJOR 0");
  if (major !== String(READER_MAJOR)) refuse("needs_newer_app", `version ${raw}: MAJOR ${major} is newer than ${READER_MAJOR}`);
  if (minor.length > 4) refuse("not_a_list", `version ${JSON.stringify(raw)}: version 1 has MINORs 0 to 9999`);
  return [READER_MAJOR, Number(minor)];
}

/** `[a-z0-9][a-z0-9-]{0,63}`, the list's slug. */
const slug = (raw) => (/^[a-z0-9][a-z0-9-]{0,63}$/.test(raw) && raw.length <= ID_LEN ? raw : null);

/** A BCP 47 tag, loosely: 2–3 letters, then `-` parts of 2–8 letters or digits. */
function language(raw) {
  const [first, ...parts] = raw.split("-");
  const ok = /^[A-Za-z]{2,3}$/.test(first) && parts.every((p) => /^[A-Za-z0-9]{2,8}$/.test(p));
  return ok ? raw : null;
}

/** `YYYY-MM-DD` exactly, a real date of the proleptic Gregorian calendar. */
function date(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [year, month, day] = m.slice(1).map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days ? raw : null;
}

const unknownKeys = (object, known) => Object.keys(object).filter((key) => !known.has(key));

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The text of the input, refused when it is too big or not UTF-8. */
function textOfInput(input) {
  if (typeof input === "string") {
    if (utf8Length(input) > MAX_BYTES) refuse("too_big", `more than ${MAX_BYTES} bytes`);
    return input;
  }
  let bytes;
  if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  else throw new TypeError("read() takes a string, a Uint8Array or an ArrayBuffer");
  if (bytes.length > MAX_BYTES) refuse("too_big", `${bytes.length} bytes, more than ${MAX_BYTES}`);
  try {
    return decoder.decode(bytes);
  } catch {
    return refuse("not_a_list", "the bytes are not UTF-8");
  }
}

/**
 * Reads a `.kpin` file: its text, or its bytes as they came (a file, a download). Every file gets
 * one answer, and a list that is `ready` comes with what was read out of it.
 * @param {string | Uint8Array | ArrayBuffer | ArrayBufferView} input
 * @returns {import("./index.js").Answer}
 */
export function read(input) {
  try {
    return { answer: "ready", list: readList(textOfInput(input)) };
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    const answer = { answer: error.answer, why: error.why };
    if (error.answer === "other_app") answer.app = error.app;
    return answer;
  }
}

function readList(text) {
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    refuse("not_a_list", "not JSON");
  }
  if (!wellFormed(root)) refuse("not_a_list", "a string holds an escaped surrogate without its pair");
  if (!isObject(root)) refuse("not_a_list", "not a JSON object");
  if (own(root, "format") !== "koona") refuse("not_a_list", 'format is not "koona"');
  const app = string(root, "app");
  if (app === undefined || !isName(app)) refuse("not_a_list", "app is missing or not a valid name");
  if (app !== "pin") refuse("other_app", `the list is for app "${app}"`, app);
  const kind = string(root, "kind");
  if (kind === undefined || !isName(kind)) refuse("not_a_list", "kind is missing or not a valid name");
  if (kind !== "list") refuse("needs_newer_app", `kind "${kind}" is not one this reader knows`);
  const rawVersion = string(root, "version");
  if (rawVersion === undefined) refuse("not_a_list", "version is missing or not a string");
  const [major, minor] = version(rawVersion);
  const newer = minor > READER_MINOR;
  const title = textOf(root, "title", TITLE_LEN);
  if (title === null) refuse("not_a_list", "title is missing, not a string or empty once cleaned");

  // The structure: arrays of objects where the format has them.
  const rawSections = own(root, "sections");
  let sections = [];
  if (Array.isArray(rawSections)) {
    if (!rawSections.every(isObject)) refuse("not_a_list", "an entry of sections is not an object");
    sections = rawSections;
  } else if (rawSections !== undefined && rawSections !== null) {
    refuse("not_a_list", "sections is neither an array nor null");
  }
  if (sections.length > MAX_SECTIONS) refuse("too_big", `${sections.length} entries of sections, more than ${MAX_SECTIONS}`);
  const itemsOf = (object, where) => {
    const items = own(object, "items");
    if (items === undefined || items === null) return [];
    if (!Array.isArray(items)) refuse("not_a_list", `${where} is neither an array nor null`);
    return items;
  };
  const groups = sections.map((section, i) => ({ name: textOf(section, "name", SECTION_LEN), items: itemsOf(section, `sections[${i}].items`), at: `sections[${i}].items` }));
  groups.push({ name: null, items: itemsOf(root, "items"), at: "items" });
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (total > MAX_ITEMS) refuse("too_big", `${total} items, more than ${MAX_ITEMS}`);
  if (total === 0) refuse("empty", "no items");

  const rawAuthor = own(root, "author");
  const author = isObject(rawAuthor) ? rawAuthor : undefined;
  const authorName = author ? textOf(author, "name", AUTHOR_LEN) : null;
  const authorUrl = author ? webAddress(own(author, "url")) : null;
  const optional = (key, take) => {
    const value = string(root, key);
    return value === undefined ? null : take(value);
  };
  const list = {
    title,
    version: `${major}.${minor}`,
    newer,
    // Only a section with a name is one: the items of a nameless one are at the top level.
    sections: groups.filter((group) => group.name !== null).length,
    meta: {
      description: optional("description", (s) => description(s, DESCRIPTION_LEN)),
      author: authorName !== null || authorUrl !== null ? { name: authorName, url: authorUrl } : null,
      license: textOf(root, "license", LICENSE_LEN),
      language: optional("language", language),
      updated: optional("updated", date),
      homepage: webAddress(own(root, "homepage")),
      id: optional("id", slug),
      generator: textOf(root, "generator", GENERATOR_LEN),
    },
    counts: { links: 0, feeds: 0, repeated: 0, not_web: 0, invalid: 0, skipped_items: 0, skipped_details: 0 },
    links: [],
    feeds: [],
    skipped: [],
  };
  const counts = list.counts;
  const detail = (at, fields) => {
    for (const field of fields) {
      counts.skipped_details++;
      list.skipped.push({ at, reason: "unknown_field", field });
    }
  };
  if (newer) {
    detail("", unknownKeys(root, ENVELOPE_KEYS));
    if (author) detail("author", unknownKeys(author, AUTHOR_KEYS));
    sections.forEach((section, i) => detail(`sections[${i}]`, unknownKeys(section, SECTION_KEYS)));
  }

  const linkAt = new Map();
  const feedAt = new Set();
  for (const group of groups) {
    group.items.forEach((item, i) => {
      const at = `${group.at}[${i}]`;
      if (!isObject(item)) {
        counts.skipped_items++;
        list.skipped.push({ at, reason: "not_an_object" });
        return;
      }
      const type = own(item, "type");
      if (type === "link") {
        if (newer) detail(at, unknownKeys(item, LINK_KEYS));
        readLink(list, linkAt, item, group.name, at);
      } else if (type === "feed") {
        if (newer) detail(at, unknownKeys(item, FEED_KEYS));
        readFeed(list, feedAt, item, group.name, at);
      } else {
        counts.skipped_items++;
        list.skipped.push({ at, reason: "unknown_type", ...(typeof type === "string" ? { type } : {}) });
      }
    });
  }
  counts.links = list.links.length;
  counts.feeds = list.feeds.length;
  return list;
}

function skip(list, at, reason, url) {
  list.counts[reason]++;
  list.skipped.push({ at, reason, ...(url === undefined ? {} : { url }) });
}

function readLink(list, seen, item, section, at) {
  const raw = string(item, "url");
  if (raw === undefined) return skip(list, at, "invalid");
  const taken = linkUrl(raw);
  if ("skip" in taken) return skip(list, at, taken.skip, raw);
  const url = taken.url;
  const tags = [];
  const rawTags = own(item, "tags");
  if (Array.isArray(rawTags)) {
    for (const raw of rawTags) {
      const name = typeof raw === "string" ? tag(raw) : null;
      if (name !== null && !tags.includes(name) && tags.length < TAGS_PER_LINK) tags.push(name);
    }
  }
  // `linkUrl` admits only http(s) with a host, which always has a key.
  const key = repeatKey(url) ?? url;
  const first = seen.get(key);
  if (first !== undefined) {
    for (const name of tags) {
      if (first.tags.length === TAGS_PER_LINK) break;
      if (!first.tags.includes(name)) first.tags.push(name);
    }
    if (section !== null && !first.sections.includes(section)) first.sections.push(section);
    return skip(list, at, "repeated", url);
  }
  const link = {
    url,
    title: textOf(item, "title", ITEM_TITLE_LEN),
    description: (() => {
      const value = string(item, "description");
      return value === undefined ? null : description(value, DESCRIPTION_LEN);
    })(),
    tags,
    sections: section === null ? [] : [section],
  };
  seen.set(key, link);
  list.links.push(link);
}

function readFeed(list, seen, item, section, at) {
  const raw = string(item, "url");
  if (raw === undefined) return skip(list, at, "invalid");
  const taken = feedUrl(raw);
  if ("skip" in taken) return skip(list, at, taken.skip, raw);
  if (seen.has(taken.url)) return skip(list, at, "repeated", taken.url);
  seen.add(taken.url);
  list.feeds.push({ url: taken.url, title: textOf(item, "title", ITEM_TITLE_LEN), site: webAddress(own(item, "site")), section });
}
