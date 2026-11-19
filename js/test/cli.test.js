// `kpin validate`: answers, counts, skips, --json, --schema and the exit status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/kpin.js", import.meta.url));
const list = (name) => fileURLToPath(new URL(`../../conformance/lists/${name}`, import.meta.url));
const kpin = (...args) => {
  const run = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
  return { status: run.status, out: run.stdout, err: run.stderr };
};

test("a ready list prints its counts and what was skipped, and exits 0", () => {
  const { status, out } = kpin("validate", list("ftp.kpin"));
  assert.equal(status, 0);
  assert.match(out, /ftp\.kpin: ready: "One address is not on the web", version 1\.0/);
  assert.match(out, /1 link, 0 feeds, 0 sections/);
  assert.match(out, /skipped: 1 not web/);
  assert.match(out, /items\[\d\] "ftp:[^"]*": not an http or https address/);
});

test("a file that is not a readable list exits 1, and every file is still reported", () => {
  const { status, out } = kpin("validate", list("valid.kpin"), list("other-app.kpin"), list("cut-off.kpin"));
  assert.equal(status, 1);
  assert.match(out, /valid\.kpin: ready/);
  assert.match(out, /other-app\.kpin: other_app \(note\)/);
  assert.match(out, /cut-off\.kpin: not_a_list: not JSON/);
});

test("--json gives the reader's answer for each file", () => {
  const { status, out } = kpin("validate", "--json", list("repeats.kpin"), list("no-items.kpin"), "no-such-file.kpin");
  assert.equal(status, 1);
  const doc = JSON.parse(out);
  assert.equal(doc.revision, "2026-11");
  const [repeats, empty, missing] = doc.files;
  assert.equal(repeats.ok, true);
  assert.equal(repeats.answer, "ready");
  assert.equal(repeats.list.counts.repeated, 2);
  assert.deepEqual(repeats.list.skipped.map((s) => s.reason), ["repeated", "repeated"]);
  assert.deepEqual([empty.ok, empty.answer], [false, "empty"]);
  assert.deepEqual([missing.ok, missing.error], [false, "ENOENT"]);
});

test("--schema checks the file against the schema too", () => {
  const valid = kpin("validate", "--schema", list("valid.kpin"));
  assert.equal(valid.status, 0);
  assert.match(valid.out, /schema: valid/);
  // Ready to a reader, refused by the schema: --schema makes it a failure.
  const ftp = kpin("validate", "--schema", "--json", list("ftp.kpin"));
  assert.equal(ftp.status, 1);
  const [file] = JSON.parse(ftp.out).files;
  assert.equal(file.answer, "ready");
  assert.equal(file.schema.valid, false);
});

test("a usage error exits 2", () => {
  assert.equal(kpin().status, 2);
  assert.equal(kpin("validate").status, 2);
  assert.equal(kpin("validate", "--nope", list("valid.kpin")).status, 2);
  assert.equal(kpin("--help").status, 0);
});

test("the package's schema-1.json is the repository's", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url));
  assert.ok(read("../schema-1.json").equals(read("../../schema-1.json")), "copy ../schema-1.json to js/schema-1.json");
});

test("the package's LICENSE.md is the repository's", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url));
  assert.ok(read("../LICENSE.md").equals(read("../../LICENSE.md")), "copy ../LICENSE.md to js/LICENSE.md");
});
