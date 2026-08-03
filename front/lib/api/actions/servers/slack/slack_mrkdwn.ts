// Slack mrkdwn → readable plain text. Slack's mrkdwn is not standard Markdown (bold is
// `*x*`, links/mentions are `<@U|name>`, `<#C|name>`, `<url|label>`, ...), so we extend
// `marked` with one inline extension per Slack token and render to plain text.

import type { TokenizerAndRendererExtension } from "marked";
import { Marked } from "marked";

function slackInlineToken(
  name: string,
  prefixHint: string,
  pattern: RegExp,
  render: (match: RegExpExecArray) => string
): TokenizerAndRendererExtension {
  return {
    name,
    level: "inline",
    start(src: string) {
      const index = src.indexOf(prefixHint);
      return index < 0 ? undefined : index;
    },
    tokenizer(src: string) {
      const match = pattern.exec(src);
      if (match) {
        return { type: name, raw: match[0], match };
      }
      return undefined;
    },
    renderer(token) {
      return render(token.match);
    },
  };
}

// Patterns are anchored (`^`): marked feeds the tokenizer the source from the match start.
const SLACK_EXTENSIONS: TokenizerAndRendererExtension[] = [
  // <@U123> or <@U123|name> -> @name (falls back to the id when no label).
  slackInlineToken(
    "slackUser",
    "<@",
    /^<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/,
    (m) => `@${m[2] ?? m[1]}`
  ),
  // <#C123> or <#C123|name> -> #name.
  slackInlineToken(
    "slackChannel",
    "<#",
    /^<#([A-Z0-9]+)(?:\|([^>]+))?>/,
    (m) => `#${m[2] ?? m[1]}`
  ),
  // <!subteam^S123|@group> -> @group ; <!subteam^S123> -> @S123.
  slackInlineToken(
    "slackSubteam",
    "<!subteam",
    /^<!subteam\^([A-Z0-9]+)(?:\|([^>]+))?>/,
    (m) => m[2] ?? `@${m[1]}`
  ),
  // <!here> / <!channel> / <!everyone> -> @here / @channel / @everyone.
  slackInlineToken(
    "slackBroadcast",
    "<!",
    /^<!(here|channel|everyone)>/,
    (m) => `@${m[1]}`
  ),
  // <mailto:foo@bar|label> -> label ; <mailto:foo@bar> -> foo@bar.
  slackInlineToken(
    "slackMailto",
    "<mailto:",
    /^<mailto:([^|>]+)(?:\|([^>]+))?>/,
    (m) => m[2] ?? m[1]
  ),
  // <https://url|label> -> label (https://url) ; <https://url> -> https://url.
  slackInlineToken(
    "slackLink",
    "<http",
    /^<(https?:\/\/[^|>]+)(?:\|([^>]+))?>/,
    (m) => (m[2] ? `${m[2]} (${m[1]})` : m[1])
  ),
];

// marked instance for Slack: renderers drop HTML markup and emit inner text; `text` uses
// `raw` so literal `&`/`<`/`>` are kept rather than turned into HTML entities.
const slackMarked = new Marked({
  extensions: SLACK_EXTENSIONS,
  renderer: {
    strong(token) {
      return this.parser.parseInline(token.tokens);
    },
    em(token) {
      return this.parser.parseInline(token.tokens);
    },
    del(token) {
      return this.parser.parseInline(token.tokens);
    },
    codespan(token) {
      return token.text;
    },
    link(token) {
      return token.text;
    },
    text(token) {
      return "tokens" in token && token.tokens
        ? this.parser.parseInline(token.tokens)
        : token.raw;
    },
  },
});

// Converts a Slack mrkdwn string to readable plain text. Inline parsing avoids
// re-interpreting block markers we emit ourselves ("- ", "> "). Never throws: on error it
// falls back to the original string.
export function slackMrkdwnToText(text: string): string {
  try {
    return slackMarked.parseInline(text, { async: false }).trim();
  } catch {
    return text;
  }
}
