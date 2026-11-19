// The one-click link of the spec: `koonapin://import?url=…`.
import { trimWhiteSpace } from "./text.js";
import { utf8Length } from "./address.js";

/** The whole link, trimmed, is at most 4,096 bytes in UTF-8. */
export const LINK_BYTES = 4096;

function parse(text) {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

const asciiLower = (text) => text.replace(/[A-Z]+/g, (s) => s.toLowerCase());

/**
 * The list's address a `koonapin://import?url=…` link offers to download, in its parsed form, or
 * `null` when the link is ignored. Only the address is read: nothing is downloaded, and an app
 * still asks the person first.
 * @param {string} link
 * @returns {string | null}
 */
export function oneClick(link) {
  const text = trimWhiteSpace(link);
  if (text === "" || utf8Length(text) > LINK_BYTES) return null;
  if (asciiLower(text.slice(0, 9)) !== "koonapin:") return null;
  const url = parse(text);
  if (!url || url.protocol !== "koonapin:" || asciiLower(url.hostname) !== "import") return null;
  // `import` alone: no user name, password or port, no path but `/`, no fragment (even an empty one).
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if ((url.pathname !== "" && url.pathname !== "/") || url.href.includes("#")) return null;
  const values = url.searchParams.getAll("url");
  if (values.length !== 1) return null;
  const target = parse(trimWhiteSpace(values[0]));
  const fine = target && target.protocol === "https:" && target.hostname !== "" && target.username === "" && target.password === "";
  return fine ? target.href : null;
}
