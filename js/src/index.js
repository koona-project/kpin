// The reference reader of the `.kpin` list format 1.x, reader rules of revision 2026-11.
export { read, MAX_DEPTH, MAX_BYTES, MAX_ITEMS, MAX_SECTIONS, TAGS_PER_LINK, READER_MAJOR, READER_MINOR } from "./read.js";
export { line, description, tag, withoutInvisible, isInvisible, joinerStays, trimWhiteSpace, JOINING_SCRIPTS, TITLE_LEN, ITEM_TITLE_LEN, DESCRIPTION_LEN, TAG_LEN, LICENSE_LEN, GENERATOR_LEN } from "./text.js";
export { linkUrl, feedUrl, webAddress, publicHost, repeatKey, URL_BYTES } from "./address.js";
export { oneClick, LINK_BYTES } from "./one-click.js";

/** The revision of the reader rules this reader follows. */
export const REVISION = "2026-11";
/** The version of the format whose fields this reader knows. */
export const SPEC = "1.0";
