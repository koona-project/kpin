#!/usr/bin/env node
// kpin validate <file...>: each file's answer, what was read and what was skipped and why.
import { readFileSync, openSync, readSync, closeSync, fstatSync } from "node:fs";
import { read, MAX_BYTES, REVISION } from "../src/index.js";

const USAGE = `Usage: kpin validate [--json] [--schema] [--quiet] <file...>

Reads each .kpin file as a reader of the .kpin list format 1.x does (reader rules of
revision ${REVISION}) and prints its answer: ready, not_a_list, needs_newer_app,
other_app, too_big or empty, with the counts of a ready list and every item or
detail that was skipped, and why.

  --json     one JSON document on stdout: { "revision", "files": [ ... ] }
  --schema   also check each file against schema-1.json (needs the packages
             ajv and ajv-formats installed beside kpin)
  --quiet    print only files that are not ready (or not schema-valid)

Exit status: 0 when every file is a ready list (and, with --schema, valid to the
schema), 1 when any is not, 2 for a usage error.`;

function fail(message) {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exit(2);
}

/** The file's bytes, at most one past the limit: a bigger file is too big whatever it holds. */
function bytesOf(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, MAX_BYTES + 1));
    let read = 0;
    while (read < buffer.length) {
      const n = readSync(fd, buffer, read, buffer.length - read, read);
      if (n === 0) break;
      read += n;
    }
    // A file still growing past the limit is too big too.
    return size > MAX_BYTES ? new Uint8Array(MAX_BYTES + 1) : buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

async function schemaChecker() {
  let Ajv, addFormats;
  try {
    ({ default: Ajv } = await import("ajv/dist/2020.js"));
    ({ default: addFormats } = await import("ajv-formats"));
  } catch {
    fail("--schema needs ajv and ajv-formats: npm install ajv@8 ajv-formats@3");
  }
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(new URL("../schema-1.json", import.meta.url), "utf8")));
  return (bytes) => {
    let doc;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // drops a byte order mark
      doc = JSON.parse(text);
    } catch {
      return { valid: false, errors: ["not UTF-8 JSON"] };
    }
    const valid = validate(doc);
    return { valid, errors: valid ? [] : validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}`) };
  };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WHY = {
  repeated: "a repeat of an earlier page",
  not_web: "not an http or https address",
  invalid: "no usable address",
  unknown_type: "an item type this reader does not know",
  not_an_object: "not an object",
  unknown_field: "a field this reader does not know",
};

function human(file) {
  const out = [];
  const { result: r } = file;
  if (file.error) out.push(`${file.path}: cannot read: ${file.error}`);
  else if (r.answer !== "ready") out.push(`${file.path}: ${r.answer}${r.app ? ` (${r.app})` : ""}: ${r.why}`);
  else {
    const { list } = r;
    const c = list.counts;
    out.push(`${file.path}: ready: "${list.title}", version ${list.version}${list.newer ? " (newer than 1.0)" : ""}`);
    out.push(`  ${plural(c.links, "link")}, ${plural(c.feeds, "feed")}, ${plural(list.sections, "section")}`);
    const skipped = [
      c.repeated && `${c.repeated} repeated`,
      c.not_web && `${c.not_web} not web`,
      c.invalid && `${c.invalid} invalid`,
      c.skipped_items && plural(c.skipped_items, "unknown item"),
      c.skipped_details && plural(c.skipped_details, "unknown detail"),
    ].filter(Boolean);
    if (skipped.length) out.push(`  skipped: ${skipped.join(", ")}`);
    for (const s of list.skipped) {
      const what = s.field ? ` "${s.field}"` : s.type ? ` "${s.type}"` : s.url ? ` ${JSON.stringify(s.url)}` : "";
      out.push(`    ${s.at || "(the list)"}${what}: ${WHY[s.reason]}`);
    }
  }
  if (file.schema) out.push(file.schema.valid ? "  schema: valid" : `  schema: not valid\n${file.schema.errors.map((e) => `    ${e}`).join("\n")}`);
  return out.join("\n");
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (command !== "validate") fail(command ? `Unknown command: ${command}` : "No command given.");
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const paths = rest.filter((a) => !a.startsWith("--"));
  for (const flag of flags) if (!["--json", "--schema", "--quiet"].includes(flag)) fail(`Unknown option: ${flag}`);
  if (paths.length === 0) fail("No file given.");
  const check = flags.has("--schema") ? await schemaChecker() : null;

  const files = paths.map((path) => {
    let bytes;
    try {
      bytes = bytesOf(path);
    } catch (error) {
      return { path, error: error.code ?? error.message, ok: false };
    }
    const result = read(bytes);
    const file = { path, result };
    if (check) file.schema = bytes.length > MAX_BYTES ? { valid: false, errors: [`not checked: more than ${MAX_BYTES} bytes`] } : check(bytes);
    file.ok = result.answer === "ready" && (!file.schema || file.schema.valid);
    return file;
  });

  if (flags.has("--json")) {
    const shown = files.map(({ path, error, result, schema, ok }) => ({ path, ok, ...(error ? { error } : result), ...(schema ? { schema } : {}) }));
    process.stdout.write(`${JSON.stringify({ revision: REVISION, files: shown }, null, 2)}\n`);
  } else {
    for (const file of files) if (!flags.has("--quiet") || !file.ok) process.stdout.write(`${human(file)}\n`);
  }
  return files.every((f) => f.ok) ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
