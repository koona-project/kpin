# Contributing

This repository holds the `.kpin` list format: its specification (`README.md`), its JSON Schema, its examples and its conformance suite. Everything in it is dedicated to the public domain under CC0 1.0 ([LICENSE.md](LICENSE.md)), and every contribution is accepted under the same terms.

## Sign-off instead of a contributor agreement

There is no contributor license agreement. Each commit carries a `Signed-off-by` line, which says you wrote the change or have the right to submit it, as the [Developer Certificate of Origin 1.1](https://developercertificate.org/) puts it, and that you dedicate it to the public domain under CC0 1.0 with the rest:

```bash
git commit -s
```

A pull request whose commits lack the line fails the check "Signed off".

## What a change brings

- **A rule of the spec** comes with its cases or vectors in `conformance/`, and a new file of `conformance/lists/` with its case in `cases.json`.
- **A change of what a reader must answer** is a change of the reader rules or of the format, and goes in the spec's changelog: under a new revision (`YYYY-MM`, written in every suite file's `revision`) when a reader becomes stricter within a version, or as a new MINOR or MAJOR as the spec's Versions section says.
- **A new case or vector** comes with the reference reader in `js/` changed to pass it. A change of what a reader must answer also sets its `REVISION` (`js/src/index.js`) to the new revision; a missing case of the current revision does not.
- **An invisible character** in a JSON file of the suite, or in the code of `js/`, is written as a `\u` escape, never as itself.

`npm ci && npm run check` checks the suite against itself and the schema, and `npm test` runs the reference reader in `js/` (the package `kpin`) against the whole suite, as CI does on every pull request. Koona Pin runs the suite in its own tests too, and so can any other reader.

The package takes `schema-1.json` and `LICENSE.md` from the root when it is packed (`js/tools/pack-files.mjs`, run by `prepack` and `postpack`), so there is one copy of each in the repository; `npm run test:pack` packs the package, checks the copies and runs the packed CLI, as CI does.

## Releases

A release is a tag: `rYYYY-MM` for a new revision of the reader rules, then `rYYYY-MM.1`, `rYYYY-MM.2` for later fixes of the same revision (wording, a missing case) that change no rule. A tag is never moved or deleted: a tool that pins one, as Koona Pin does by tag and commit, must get the same files from it every time.

## Koona Pin

Koona Pin keeps a copy of this repository in its `docs/kpin/`, pinned to a tag and its commit here, and checks in its CI that the copy is that tag's files and that its reader passes the suite. A change here reaches Koona Pin when its copy moves to the new tag.
