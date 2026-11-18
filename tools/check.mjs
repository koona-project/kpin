// Checks the conformance suite against itself and the schema: every list has its case and every
// case its file, the schema answers each case as `schema_valid` says, every example is valid, every
// suite file names one revision, and no JSON file of the suite holds an invisible character
// written as itself. It checks no reader: a reader runs the suite in its own tests.
//
//   npm ci && node tools/check.mjs
import { readFileSync, readdirSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const problems = [];
const problem = (text) => problems.push(text);

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(read("schema-1.json")));

const BOM = String.fromCodePoint(0xfeff);
/** The JSON of a text, a byte order mark at the start ignored; undefined for a text that is not JSON. */
function json(text) {
  try {
    return JSON.parse(text.startsWith(BOM) ? text.slice(1) : text);
  } catch {
    return undefined;
  }
}

/** A case's file, as the suite's README says, `generate` included. */
function caseText(c) {
  if (c.file) return read(`conformance/${c.file}`);
  const { from, pad_to_bytes, add_links = 0, add_sections = 0, remove = [], set = {} } = c.generate;
  const base = read(`conformance/${from}`);
  if (pad_to_bytes !== undefined) return base + " ".repeat(Math.max(0, pad_to_bytes - Buffer.byteLength(base)));
  const list = JSON.parse(base);
  for (const key of remove) delete list[key];
  Object.assign(list, set);
  for (let i = 0; i < add_links; i++) (list.items ??= []).push({ type: "link", url: `https://example.com/added/${i}` });
  for (let i = 0; i < add_sections; i++) (list.sections ??= []).push({ name: `Added ${i}`, items: [{ type: "link", url: `https://example.com/section/${i}` }] });
  return JSON.stringify(list, null, 2);
}

const suite = JSON.parse(read("conformance/cases.json"));
const revision = suite.revision;
if (!/^\d{4}-\d{2}$/.test(revision ?? "")) problem(`cases.json: revision ${JSON.stringify(revision)} is not YYYY-MM`);

// Every list has its case, every case its file, and the schema answers as the case says.
const files = new Set(suite.cases.filter((c) => c.file).map((c) => c.file));
for (const name of readdirSync(new URL("conformance/lists/", root))) {
  if (name.toLowerCase().endsWith(".kpin") && !files.has(`lists/${name}`)) problem(`lists/${name} has no case`);
}
for (const c of suite.cases) {
  const label = c.file ?? c.name;
  if (!c.file && !c.generate) problem(`a case has neither file nor generate: ${JSON.stringify(c).slice(0, 80)}`);
  if (!c.file && !c.name) problem(`a generated case has no name: ${JSON.stringify(c.generate)}`);
  let text;
  try {
    text = caseText(c);
  } catch (error) {
    problem(`${label}: ${error.message}`);
    continue;
  }
  const valid = validate(json(text));
  if (valid !== c.schema_valid) problem(`${label}: the schema says ${valid}, the case says ${c.schema_valid}`);
  if (c.schema_cannot_see && !c.schema_valid) problem(`${label}: schema_cannot_see on a file the schema refuses`);
  if (c.reader === "other_app" && !c.app) problem(`${label}: other_app without app`);
}

// Every example is valid.
for (const name of readdirSync(new URL("examples/", root))) {
  if (!validate(json(read(`examples/${name}`)))) problem(`examples/${name}: ${ajv.errorsText(validate.errors)}`);
}

// One revision everywhere, and no invisible character written as itself.
const hidden = /[\p{Cc}\p{Cf}\p{M}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u;
for (const name of ["cases.json", "text.json", "addresses.json", "same-page.json", "one-click.json"]) {
  const text = read(`conformance/${name}`);
  const doc = json(text);
  if (doc === undefined) {
    problem(`${name}: not JSON`);
    continue;
  }
  if (doc.revision !== revision) problem(`${name}: revision ${JSON.stringify(doc.revision)}, not ${revision}`);
  text.split("\n").forEach((line, i) => {
    const found = line.replace(/\r$/, "").match(hidden);
    if (found) problem(`${name}:${i + 1}: U+${found[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} written as itself; write it as an escape`);
  });
}

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`The suite is consistent: ${suite.cases.length} cases, revision ${revision}.`);
