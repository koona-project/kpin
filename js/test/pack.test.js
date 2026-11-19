// The package as npm would publish it: packed, unpacked outside the checkout, and run. Its
// schema-1.json and LICENSE.md are the root's (copied in by prepack), and its own CLI finds the
// schema, so a broken copy step fails here instead of in an installed kpin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const js = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));

test("the packed package carries the root's schema and licence, and its --schema works", () => {
  // Unpacked under the root's node_modules, so ajv and ajv-formats resolve as they would beside
  // an installed kpin, and away from conformance/, so the CLI takes the package's own schema.
  mkdirSync(join(root, "node_modules"), { recursive: true });
  const dir = mkdtempSync(join(root, "node_modules", ".kpin-pack-"));
  try {
    // Through npm's own script when npm runs the test (no shell, so a path with spaces stays one
    // argument); otherwise one command line for the shell, the path quoted.
    const npm = process.env.npm_execpath;
    const options = { cwd: js, encoding: "utf8" };
    const pack = npm?.endsWith(".js")
      ? spawnSync(process.execPath, [npm, "pack", "--pack-destination", dir], options)
      : spawnSync(`npm pack --pack-destination "${dir}"`, { ...options, shell: true });
    assert.equal(pack.status, 0, pack.stderr);
    // The tarball is the one file npm wrote to the empty folder, whatever else it printed.
    const [filename, ...others] = readdirSync(dir).filter((name) => name.endsWith(".tgz"));
    assert.ok(filename && others.length === 0, `one tarball in ${dir}`);
    const untar = spawnSync("tar", ["-xzf", filename], { cwd: dir, encoding: "utf8" });
    assert.equal(untar.status, 0, untar.stderr);
    const unpacked = join(dir, "package");
    for (const name of ["schema-1.json", "LICENSE.md"]) {
      assert.ok(readFileSync(join(unpacked, name)).equals(readFileSync(join(root, name))), `${name} in the package is the root's`);
      assert.equal(existsSync(join(js, name)), false, `postpack leaves no ${name} in js/`);
    }
    const run = spawnSync(process.execPath, [join(unpacked, "bin", "kpin.js"), "validate", "--schema", join(root, "examples", "minimal.kpin")], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /schema: valid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
