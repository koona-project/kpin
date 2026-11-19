// Text as the spec's Text section cleans it: flags kept whole, invisible characters dropped,
// joiners judged by their neighbours, one-line fields and descriptions, the cut.

/** A title of the list, a section's name, `author.name`: 120 characters. */
export const TITLE_LEN = 120;
/** An item's title. */
export const ITEM_TITLE_LEN = 500;
/** A description of the list or of a link. */
export const DESCRIPTION_LEN = 2000;
/** A tag. */
export const TAG_LEN = 64;
export const LICENSE_LEN = 64;
export const GENERATOR_LEN = 80;

const ZWNJ = "\u200C";
const ZWJ = "\u200D";

const WHITE_SPACE = /\p{White_Space}/u;
const CONTROL = /\p{Cc}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const LEADING = /^\p{White_Space}+/u;
const TRAILING = /\p{White_Space}+$/u;

const isWhiteSpace = (c) => WHITE_SPACE.test(c);
const isControl = (c) => CONTROL.test(c);

/**
 * The three subdivision flags Unicode recommends for general interchange (England, Scotland,
 * Wales): U+1F3F4, the tags of `gbeng`, `gbsct` or `gbwls`, then CANCEL TAG. Only these keep their
 * tag characters.
 */
const FLAGS = ["gbeng", "gbsct", "gbwls"].map((name) => [
  "\u{1F3F4}",
  ...[...name].map((c) => String.fromCodePoint(0xe0000 + c.codePointAt(0))),
  "\u{E007F}",
]);

/**
 * The scripts where a joiner or non-joiner changes how letters are drawn: the joining scripts and
 * the Brahmic ones of India and Sri Lanka. The Script property, not Script_Extensions.
 */
export const JOINING_SCRIPTS = Object.freeze([
  "Arabic",
  "Syriac",
  "Nko",
  "Mongolian",
  "Mandaic",
  "Manichaean",
  "Adlam",
  "Hanifi_Rohingya",
  "Devanagari",
  "Bengali",
  "Gurmukhi",
  "Gujarati",
  "Oriya",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Sinhala",
]);
const SCRIPTS = JOINING_SCRIPTS.map((name) => new RegExp(`^\\p{Script=${name}}$`, "u"));

/**
 * Whether one character (a code point) is one of the spec's invisible characters: U+00AD, U+061C,
 * U+180E, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+206F, U+FEFF, U+FFF9–U+FFFB,
 * U+E0001 and U+E0020–U+E007F. Filter with this alone and the flags and joiners that are seen break:
 * use {@link withoutInvisible}.
 * @param {string} c
 */
export function isInvisible(c) {
  const cp = c.codePointAt(0);
  return (
    cp === 0xad ||
    cp === 0x61c ||
    cp === 0x180e ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    (cp >= 0x2066 && cp <= 0x206f) ||
    cp === 0xfeff ||
    (cp >= 0xfff9 && cp <= 0xfffb) ||
    cp === 0xe0001 ||
    (cp >= 0xe0020 && cp <= 0xe007f)
  );
}

/**
 * Whether a zero width joiner or non-joiner stays between `before` and `after`, judged once the
 * other invisible characters and the controls that are not white space are gone: between two
 * characters of one of the {@link JOINING_SCRIPTS}, or, a joiner, between two emoji.
 * @param {string} joiner U+200D or U+200C
 * @param {string | undefined} before
 * @param {string | undefined} after
 */
export function joinerStays(joiner, before, after) {
  if (before === undefined || after === undefined) return false;
  const script = SCRIPTS.find((re) => re.test(before));
  if (script && script.test(after)) return true;
  const cp = before.codePointAt(0);
  const joinsAfter = PICTOGRAPHIC.test(before) || cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff);
  return joiner === ZWJ && joinsAfter && PICTOGRAPHIC.test(after);
}

/** Each character of `chars` and whether it is seen. */
function seenMarks(chars) {
  if (!chars.some(isInvisible)) return chars.map((c) => [c, true]);
  // The flags whole, everything but the joiners, then the joiners judged by what stands around them.
  const marks = [];
  for (let i = 0; i < chars.length; ) {
    const flag = FLAGS.find((f) => f.every((c, k) => chars[i + k] === c));
    if (flag) {
      for (const c of flag) marks.push([c, true]);
      i += flag.length;
      continue;
    }
    const c = chars[i++];
    marks.push([c, c === ZWJ || c === ZWNJ || !isInvisible(c)]);
  }
  // A white space control (a tab, a line break) stays a neighbour; other controls do not.
  const kept = [];
  marks.forEach(([c, seen], i) => {
    if (seen && !(isControl(c) && !isWhiteSpace(c))) kept.push(i);
  });
  const judged = [];
  kept.forEach((i, at) => {
    const c = marks[i][0];
    if (c !== ZWJ && c !== ZWNJ) return;
    const before = at > 0 ? marks[kept[at - 1]][0] : undefined;
    const after = at + 1 < kept.length ? marks[kept[at + 1]][0] : undefined;
    judged.push([i, joinerStays(c, before, after)]);
  });
  for (const [i, stays] of judged) marks[i][1] = stays;
  return marks;
}

/**
 * The text without its invisible characters, except those that are seen: the tags of the three
 * subdivision flags, kept whole, and a joiner or non-joiner where it changes what is drawn.
 * @param {string} raw
 */
export function withoutInvisible(raw) {
  return seenOnly(Array.from(raw), raw);
}

/** {@link withoutInvisible} of text already split into code points; `raw` is that text, if known. */
function seenOnly(chars, raw = undefined) {
  if (!chars.some(isInvisible)) return raw ?? chars.join("");
  return seenMarks(chars)
    .filter(([, seen]) => seen)
    .map(([c]) => c)
    .join("");
}

/** Text that the marks keep whole: nothing to drop, single plain spaces between words. */
function isALine(chars) {
  let spaceBefore = true;
  for (const c of chars) {
    if (c === " ") {
      if (spaceBefore) return false;
      spaceBefore = true;
    } else if (isWhiteSpace(c) || isControl(c) || isInvisible(c)) {
      return false;
    } else {
      spaceBefore = false;
    }
  }
  return !spaceBefore || chars.length === 0;
}

/**
 * At most `max` characters, the end trimmed; empty is none. A cut through a flag leaves its tags
 * without their end, and a cut right after a joiner leaves it with nothing after it: they go too.
 */
function capped(text, max, chars = Array.from(text)) {
  let cut = chars.length > max ? seenOnly(chars.slice(0, max)) : text;
  cut = cut.replace(TRAILING, "");
  return cut === "" ? null : cut;
}

/**
 * What a one-line field becomes: a title, a section's name, `author.name`, `license`, `generator`.
 * White space becomes one space between words, controls and invisible characters go, at most
 * `max` characters. `null` when nothing is left.
 * @param {string} raw
 * @param {number} max
 * @returns {string | null}
 */
export function line(raw, max) {
  const chars = Array.from(raw);
  if (isALine(chars)) return capped(raw, max, chars);
  const marks = seenMarks(chars).map(([c, seen]) => [c, seen ? "kept" : "dropped"]);
  // Between two words one character of the white space stays: the first plain space, or else the
  // first of them, as a plain space.
  let run = [];
  let wordBefore = false;
  for (let i = 0; i < marks.length; i++) {
    const [c, mark] = marks[i];
    if (mark === "dropped") continue;
    if (isWhiteSpace(c)) {
      marks[i][1] = "dropped";
      run.push(i);
    } else if (isControl(c)) {
      marks[i][1] = "dropped";
    } else {
      if (wordBefore && run.length > 0) {
        const space = run.find((j) => marks[j][0] === " ");
        if (space !== undefined) marks[space][1] = "kept";
        else marks[run[0]][1] = "space";
      }
      run = [];
      wordBefore = true;
    }
  }
  const kept = marks.filter(([, mark]) => mark !== "dropped").map(([c, mark]) => (mark === "space" ? " " : c));
  return capped(kept.join(""), max, kept);
}

/**
 * What a description becomes: as {@link line}, but its line breaks stay. `\r\n` becomes `\n`,
 * every other control goes, the ends are trimmed. `null` when nothing is left.
 * @param {string} raw
 * @param {number} [max]
 * @returns {string | null}
 */
export function description(raw, max = DESCRIPTION_LEN) {
  // Split into code points once: cleaned, controls dropped and the ends trimmed on the array.
  const chars = Array.from(raw.replaceAll("\r\n", "\n"));
  const seen = chars.some(isInvisible) ? seenMarks(chars).filter(([, s]) => s).map(([c]) => c) : chars;
  const kept = seen.filter((c) => c === "\n" || !isControl(c));
  const trimmed = trimChars(kept);
  return capped(trimmed.join(""), max, trimmed);
}

/**
 * A tag: lowercased (the default Unicode lowercase), one line, at most 64 characters.
 * @param {string} raw
 * @returns {string | null}
 */
export function tag(raw) {
  return line(raw.toLowerCase(), TAG_LEN);
}

/** Trims Unicode White_Space off both ends (not U+FEFF, which `String.prototype.trim` takes too). */
export function trimWhiteSpace(text) {
  return text.replace(LEADING, "").replace(TRAILING, "");
}

/** {@link trimWhiteSpace} of text already split into code points: the same rule, on the array. */
function trimChars(chars) {
  let start = 0;
  let end = chars.length;
  while (start < end && isWhiteSpace(chars[start])) start++;
  while (end > start && isWhiteSpace(chars[end - 1])) end--;
  return chars.slice(start, end);
}
