// The files the package takes from the repository's root when it is packed: copied in by
// prepack, removed again by postpack, so the repository keeps one copy of each.
//
//   node tools/pack-files.mjs copy | remove
import { copyFileSync, rmSync } from "node:fs";

const FILES = ["schema-1.json", "LICENSE.md"];
const js = new URL("../", import.meta.url);
const action = process.argv[2];

for (const name of FILES) {
  const here = new URL(name, js);
  if (action === "copy") copyFileSync(new URL(`../${name}`, js), here);
  else if (action === "remove") rmSync(here, { force: true });
  else {
    console.error("Usage: node tools/pack-files.mjs copy | remove");
    process.exit(2);
  }
}
