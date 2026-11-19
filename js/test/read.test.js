// Edges of read() the suite does not reach: values a repeated key replaces, and the kinds of
// bytes it takes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read } from "../src/index.js";

const list = (extra) => `{"format":"koona","app":"pin","kind":"list","version":"1.0","title":"T",${extra}"items":[{"type":"link","url":"https://e.example/"}]}`;
const nested = (levels) => `${"[".repeat(levels)}${"]".repeat(levels)}`;

test("a value a repeated key replaced still stands in the file", () => {
  // JSON.parse keeps only the last; a reader that parses every value (Koona Pin's) refuses the first.
  for (const [what, first] of [
    ["a number out of range", "1e400"],
    ["a lone surrogate", '"\\ud800"'],
    ["a lone surrogate in a key", '{"\\udc00":1}'],
    ["nesting past 127 levels", nested(127)],
  ]) {
    assert.equal(read(list(`"x":${first},"x":1,`)).answer, "not_a_list", what);
  }
  // At the limits, and with pairs and escapes that are fine, the file is read.
  assert.equal(read(list(`"x":${nested(126)},"x":1,`)).answer, "ready");
  assert.equal(read(list(`"x":"\\ud83d\\ude00 \\" \\\\ \\u0041","y":[1.7976931348623157e308,-0,1e-400],`)).answer, "ready");
  // A raw lone surrogate, which only a string given to read() can hold.
  assert.equal(read(list(`"x":"\uD800",`)).answer, "not_a_list");
});

test("read() takes a string, bytes, an ArrayBuffer, a SharedArrayBuffer or any view", () => {
  const bytes = new TextEncoder().encode(list(""));
  const shared = new SharedArrayBuffer(bytes.length);
  new Uint8Array(shared).set(bytes);
  for (const input of [list(""), bytes, bytes.buffer, shared, new Uint8Array(shared), new DataView(bytes.buffer)]) {
    assert.equal(read(input).answer, "ready", Object.prototype.toString.call(input));
  }
  assert.throws(() => read(42), TypeError);
});
