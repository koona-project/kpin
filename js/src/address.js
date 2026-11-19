// Addresses as the spec's Addresses and Repeats sections take them: links, feeds, web addresses,
// the refused feed hosts and the repeat key. Parsed with the WHATWG URL parser.
import { trimWhiteSpace } from "./text.js";

/** Any address: at most 2,048 bytes in UTF-8, as the file writes it (trimmed). */
export const URL_BYTES = 2048;

const encoder = new TextEncoder();
/** The length of a text in UTF-8. */
export const utf8Length = (text) => encoder.encode(text).length;

const WHITE_SPACE_OR_CONTROL = /[\p{White_Space}\p{Cc}]/u;

function parse(text) {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

const isWeb = (url) => url.protocol === "http:" || url.protocol === "https:";

/** Drops a user name and password from an address; `true` when there were any. */
function withoutCredentials(url) {
  if (url.username === "" && url.password === "") return false;
  url.username = "";
  url.password = "";
  return true;
}

/**
 * A link's address as it is kept, or why the link is skipped. Kept exactly as written (trimmed),
 * unless it had credentials removed or holds white space or controls: then in its parsed form.
 * @param {string} raw
 * @returns {{ url: string } | { skip: "invalid" | "not_web" }}
 */
export function linkUrl(raw) {
  const href = trimWhiteSpace(raw);
  if (utf8Length(href) > URL_BYTES) return { skip: "invalid" };
  const url = parse(href);
  if (!url) return { skip: "invalid" };
  if (!isWeb(url)) return { skip: "not_web" };
  if (url.hostname === "") return { skip: "invalid" };
  if (withoutCredentials(url) || WHITE_SPACE_OR_CONTROL.test(href)) return { url: url.href };
  return { url: href };
}

/**
 * A feed's address in its parsed form, or why the feed is skipped: as a link, and one on this
 * computer or the local network is invalid.
 * @param {string} raw
 * @returns {{ url: string } | { skip: "invalid" | "not_web" }}
 */
export function feedUrl(raw) {
  const href = trimWhiteSpace(raw);
  if (utf8Length(href) > URL_BYTES) return { skip: "invalid" };
  const url = parse(href);
  if (!url) return { skip: "invalid" };
  if (!isWeb(url)) return { skip: "not_web" };
  if (!publicHost(url.hostname)) return { skip: "invalid" };
  withoutCredentials(url);
  return { url: url.href };
}

/**
 * A web address (`homepage`, `author.url`, a feed's `site`): the link rule, or `null` when the
 * field is dropped.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function webAddress(raw) {
  if (typeof raw !== "string") return null;
  const taken = linkUrl(raw);
  return "url" in taken ? taken.url : null;
}

const asciiLower = (text) => text.replace(/[A-Z]+/g, (s) => s.toLowerCase());

/**
 * Whether a feed may be on this host, as a WHATWG parser writes it (`hostname`): not `localhost`,
 * `*.localhost` or `*.local`, and not an IPv4 or IPv6 address of this computer or a local network.
 * @param {string} hostname
 */
export function publicHost(hostname) {
  if (hostname === "") return false;
  if (hostname.startsWith("[")) {
    const segments = ipv6(hostname.slice(1, -1));
    return segments !== null && publicV6(segments);
  }
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (v4) return publicV4(v4.slice(1).map(Number));
  const name = asciiLower(hostname.replace(/\.+$/, ""));
  return !(name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local"));
}

function publicV4([a, b, c]) {
  return !(
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b < 128) || // shared address space
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b < 32) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 198 && b >= 18 && b < 20) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** The eight 16-bit segments of an IPv6 address as a WHATWG parser writes it (hex, `::`). */
function ipv6(text) {
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part) => (part === "" ? [] : part.split(":").map((g) => parseInt(g, 16)));
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const segments = [...head, ...Array(fill).fill(0), ...tail];
  return segments.some((s) => !(s >= 0 && s <= 0xffff)) ? null : segments;
}

function publicV6(s) {
  const v4Of = (hi, lo) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
  const zeros = (n) => s.slice(0, n).every((x) => x === 0);
  // An IPv4 address carried in IPv6 is judged as IPv4: mapped, or the NAT64 well-known prefix.
  if (zeros(5) && s[5] === 0xffff) return publicV4(v4Of(s[6], s[7]));
  if (s[0] === 0x64 && s[1] === 0xff9b && s.slice(2, 6).every((x) => x === 0)) return publicV4(v4Of(s[6], s[7]));
  return !(
    zeros(6) || // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
    (s[0] & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (s[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (s[0] & 0xffc0) === 0xfec0 || // old site-local fec0::/10
    (s[0] & 0xff00) === 0xff00 // multicast
  );
}

const TRACKING = new Set(["fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "mc_eid", "mc_cid", "igshid"]);
const isTracking = (name) => {
  const lower = asciiLower(name);
  return lower.startsWith("utm_") || TRACKING.has(lower);
};

/** Compares two texts by code point, as UTF-8 bytes compare (not by UTF-16 unit). */
function byCodePoint(a, b) {
  let i = 0;
  while (i < a.length && i < b.length) {
    const x = a.codePointAt(i);
    const y = b.codePointAt(i);
    if (x !== y) return x - y;
    i += x > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : i < b.length ? -1 : 0;
}

/**
 * The repeat key of an address: what does not change the page set aside (`http` or `https`, one
 * leading `www.`, the case of the host, a default port, every trailing slash, the fragment,
 * tracking parameters, the order of the other parameters). Two links of one file are the same page
 * when their keys are equal. `null` for an address that is not http(s). How the key is written is
 * this reader's own business: compare keys, do not store them as a format.
 * @param {string} raw
 * @returns {string | null}
 */
export function repeatKey(raw) {
  const url = parse(trimWhiteSpace(raw));
  if (!url || !isWeb(url) || url.hostname === "") return null;
  const host = url.hostname.toLowerCase();
  const name = host.startsWith("www.") ? host.slice(4) : host;
  const port = url.port === "" ? "" : `:${url.port}`;
  const path = url.pathname.replace(/\/+$/, "");
  const pairs = [...url.searchParams].filter(([key]) => !isTracking(key));
  pairs.sort((p, q) => byCodePoint(p[0], q[0]) || byCodePoint(p[1], q[1]));
  const query = pairs.length === 0 ? "" : `?${new URLSearchParams(pairs).toString()}`;
  return `${name}${port}${path}${query}`;
}
