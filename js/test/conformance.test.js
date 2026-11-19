// The whole conformance suite (../../conformance, its README says how each file is read) against
// this reader: every case of cases.json and every vector of text.json, addresses.json,
// same-page.json and one-click.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { read, line, description, tag, linkUrl, feedUrl, webAddress, repeatKey, oneClick, TAG_LEN, REVISION } from "../src/index.js";

const suite = new URL("../../conformance/", import.meta.url);
const text = (path) => readFileSync(new URL(path, suite), "utf8");
const json = (path) => JSON.parse(text(path));
const vectors = (name) => {
  const doc = json(name);
  assert.equal(doc.revision, REVISION, `${name} is of revision ${doc.revision}, this reader of ${REVISION}`);
  return doc.vectors;
};
const label = (v) => JSON.stringify(v).slice(0, 160);

/** A vector's text grown by its `pad`: `with` appended until it is `to_bytes` bytes in UTF-8. */
function padded(input, pad) {
  if (!pad) return input;
  const missing = pad.to_bytes - Buffer.byteLength(input);
  return missing > 0 ? input + pad.with.repeat(Math.ceil(missing / Buffer.byteLength(pad.with))) : input;
}

/** A case's file: as it is, or made from another by its `generate`. */
function caseText(c) {
  if (c.file) return readFileSync(new URL(c.file, suite));
  const { from, pad_to_bytes, add_links = 0, add_sections = 0, remove = [], set = {} } = c.generate;
  const base = text(from);
  if (pad_to_bytes !== undefined) return padded(base, { with: " ", to_bytes: pad_to_bytes });
  const list = JSON.parse(base);
  for (const key of remove) delete list[key];
  Object.assign(list, set);
  for (let i = 0; i < add_links; i++) (list.items ??= []).push({ type: "link", url: `https://example.com/added/${i}` });
  for (let i = 0; i < add_sections; i++) (list.sections ??= []).push({ name: `Added ${i}`, items: [{ type: "link", url: `https://example.com/section/${i}` }] });
  return JSON.stringify(list, null, 2);
}

const cases = json("cases.json");

test("cases.json: every file gets the answer and reads as the case says", () => {
  assert.equal(cases.revision, REVISION);
  let checked = 0;
  for (const c of cases.cases) {
    const name = c.file ?? c.name;
    const result = read(caseText(c));
    assert.equal(result.answer, c.reader, `${name}: ${result.why ?? ""}`);
    if (c.reader === "other_app") assert.equal(result.app, c.app, name);
    if (c.schema_valid && !c.schema_cannot_see) {
      assert.ok(["ready", "other_app", "needs_newer_app", "too_big"].includes(result.answer), `${name}: a valid file is refused only for its app, its kind or its size`);
    }
    for (const [key, want] of Object.entries(c.list ?? {})) assert.deepEqual(result.list[key], want, `${name}: ${key}`);
    checked++;
  }
  assert.equal(checked, cases.cases.length);
});

test("cases.json: every file of lists/ has its case", () => {
  const files = new Set(cases.cases.map((c) => c.file));
  for (const name of readdirSync(new URL("lists/", suite))) {
    if (name.toLowerCase().endsWith(".kpin")) assert.ok(files.has(`lists/${name}`), `no case for lists/${name}`);
  }
});

test("text.json: text is cleaned and cut", () => {
  for (const v of vectors("text.json")) {
    let out;
    if (v.rule === "line") out = line(v.in, v.max);
    else if (v.rule === "description") out = description(v.in, v.max);
    else if (v.rule === "tag") {
      assert.equal(v.max, TAG_LEN);
      out = tag(v.in);
    } else assert.fail(`no rule ${v.rule}`);
    assert.equal(out, v.out, label(v));
  }
});

test("addresses.json: addresses are kept, in their form, or skipped", () => {
  for (const v of vectors("addresses.json")) {
    const input = padded(v.in, v.pad);
    if (v.rule === "web") {
      assert.equal(webAddress(input), v.out, label(v));
      continue;
    }
    const taken = v.rule === "link" ? linkUrl(input) : v.rule === "feed" ? feedUrl(input) : assert.fail(`no rule ${v.rule}`);
    if ("out" in v) assert.deepEqual(taken, { url: v.out }, label(v));
    else if ("skip" in v) assert.deepEqual(taken, { skip: v.skip }, label(v));
    else if ("ok" in v) assert.equal("url" in taken, v.ok, label(v));
    else assert.fail(`${label(v)}: no out, skip or ok`);
  }
});

test("same-page.json: repeats are the same page", () => {
  const key = (raw) => {
    const taken = linkUrl(raw);
    assert.ok("url" in taken, raw);
    return repeatKey(taken.url);
  };
  for (const v of vectors("same-page.json")) assert.equal(key(v.a) === key(v.b), v.same, label(v));
});

test("one-click.json: which links are accepted", () => {
  for (const v of vectors("one-click.json")) {
    const url = oneClick(padded(v.link, v.pad));
    if ("ok" in v) assert.equal(url !== null, v.ok, label(v));
    else assert.equal(url, v.url, label(v));
  }
});

test("the examples of the spec read as it says", () => {
  const example = (name) => read(readFileSync(new URL(`../../examples/${name}`, import.meta.url)));
  const minimal = example("minimal.kpin").list;
  assert.deepEqual([minimal.counts.links, minimal.counts.feeds, minimal.sections, minimal.newer], [3, 0, 0, false]);
  const sections = example("sections-and-feeds.kpin").list;
  assert.deepEqual([sections.counts.links, sections.counts.feeds, sections.sections], [3, 2, 2]);
  assert.equal(sections.meta.description, "Personal sites and their feeds.\nChecked by hand in October 2026.");
  const newer = example("newer-minor-1.1.kpin").list;
  assert.equal(newer.newer, true);
  // `cover`, the link's `rating`, the feed's `color`; the `note` is an item.
  assert.deepEqual([newer.counts.links, newer.counts.feeds, newer.counts.skipped_details, newer.counts.skipped_items], [1, 1, 3, 1]);
});
