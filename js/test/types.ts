// The types of the package, checked by `tsc -p test`: what a TypeScript user writes compiles.
import { read, line, tag, linkUrl, repeatKey, oneClick, type Answer, type List, type Taken } from "kpin";

const answer: Answer = read(new Uint8Array());
if (answer.answer === "ready") {
  const list: List = answer.list;
  const first: string | undefined = list.links[0]?.url;
  const counted: number = list.counts.repeated + list.counts.skipped_details;
  const where: string[] = list.skipped.map((s) => `${s.at}: ${s.reason}`);
  void [first, counted, where];
} else if (answer.answer === "other_app") {
  const app: string = answer.app;
  void app;
} else {
  const why: string = answer.why;
  void why;
}
const taken: Taken = linkUrl(" https://example.com/ ");
const url: string | null = "url" in taken ? taken.url : null;
const cleaned: (string | null)[] = [line("a", 10), tag("A"), repeatKey("https://a.example/"), oneClick("koonapin://import"), url];
void cleaned;
