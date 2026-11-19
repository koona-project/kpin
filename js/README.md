# kpin

The reference reader and validator of the [`.kpin` list format](https://github.com/koona-project/kpin/blob/main/README.md) 1.x, reader rules of revision **2026-11**. It reads and checks `.kpin` files without Koona Pin, and passes the whole [conformance suite](https://github.com/koona-project/kpin/blob/main/conformance).

- ESM with TypeScript types, no runtime dependencies.
- Runs in Node 18 and later, and in browsers.
- Dedicated to the public domain under CC0 1.0, like the spec ([LICENSE.md](https://github.com/koona-project/kpin/blob/main/LICENSE.md)).

## Read a list

```js
import { read } from "kpin";

const answer = read(bytes); // a Uint8Array or ArrayBuffer as it came, or a string
if (answer.answer === "ready") {
  const { title, links, feeds, counts, skipped } = answer.list;
} else {
  console.log(answer.answer, answer.why); // not_a_list, needs_newer_app, other_app (with app), too_big, empty
}
```

Give `read` the file's bytes when you have them: it refuses bytes that aren't UTF-8 as not a list, as the spec says. A string has already been decoded by someone else.

A `ready` list is what the suite's `list` describes: `title`, `version`, `newer`, `sections` (how many have a name), `meta`, `counts`, `links` and `feeds`. On top of that, `skipped` says where each skipped item or detail was (`sections[0].items[2]`) and why. `why` on a refusal is meant for a person. It isn't part of the format, so don't match on it.

The rules the vector files test are exported too:

| Export | Rule of the spec |
| --- | --- |
| `line(text, max)`, `description(text, max)`, `tag(text)`, `withoutInvisible`, `isInvisible`, `joinerStays` | [Text](https://github.com/koona-project/kpin/blob/main/README.md#text) |
| `linkUrl(raw)`, `feedUrl(raw)` → `{ url }` or `{ skip: "invalid" \| "not_web" }`; `webAddress(raw)` → address or `null`; `publicHost(hostname)` | [Addresses](https://github.com/koona-project/kpin/blob/main/README.md#addresses) |
| `repeatKey(url)`: equal keys are the same page | [Repeats](https://github.com/koona-project/kpin/blob/main/README.md#repeats) |
| `oneClick(link)` → the list's address or `null` | [The one-click link](https://github.com/koona-project/kpin/blob/main/README.md#the-one-click-link) |

Limits and names are exported as constants: `MAX_BYTES`, `MAX_ITEMS`, `MAX_SECTIONS`, `TAGS_PER_LINK`, `URL_BYTES`, `REVISION` and the rest.

## Validate files

```bash
npx kpin validate list.kpin other.kpin
```

```
list.kpin: ready: "Small web starter", version 1.0
  3 links, 2 feeds, 2 sections
  skipped: 1 not web
    items[3] "ftp://example.com/file": not an http or https address
other.kpin: not_a_list: title is missing, not a string or empty once cleaned
```

- `--json` prints one JSON document, `{ "revision", "files": [{ "path", "ok", "answer", "list" | "why", ... }] }`.
- `--schema` also checks each file against [schema-1.json](https://github.com/koona-project/kpin/blob/main/schema-1.json), the schema a writer must satisfy. It needs `ajv` and `ajv-formats` beside `kpin` (`npm install kpin ajv@8 ajv-formats@3`). They are optional peer dependencies, so the reader itself installs nothing.
- `--quiet` prints only the files that fail.

The exit status is 0 when every file is a ready list (and, with `--schema`, valid to the schema), 1 when any isn't, and 2 for a usage error.

## Unicode and URLs

The reader uses the JavaScript engine's Unicode data (`\p{Script=…}`, `\p{Extended_Pictographic}`, `\p{White_Space}`, `toLowerCase`) and its WHATWG URL parser. The spec asks for the Unicode properties of version 16.0 or later. An engine with older data, such as Node 18 (Unicode 15.1, `process.versions.unicode`), passes the suite, but it may judge a joiner next to a character assigned in Unicode 16.0 differently. URL parsers may also differ at the edges: Node's parser accepts `https://xn--/`, for example, while Rust's `url` crate refuses it.

## Tests

From the repository's root: `npm ci && npm test` runs the conformance suite, the CLI tests and the type check.
