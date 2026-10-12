// Mermaid lays a chart out in the page, and the browser loads whatever the chart names while it
// does: an image, a CSS background, a font. No sanitizing of its output can stop that, so a chart
// that could name another site is not rendered at all.

// Browsers drop tabs and line breaks inside URLs, so they could split what is checked below.
const URL_IGNORED_CHARACTERS = /[\t\n\r]/g;
// `//` starts an address on another site, and `\` is read as `/` in URLs.
const OTHER_SITE_PREFIX = /\/\/|\\/;
// A network scheme other than the page's own, such as `http:evil.com` from an https page, points to
// another site even without slashes.
const NETWORK_SCHEME = /(?:^|[^a-z0-9+.-])(?:https?|ftps?|wss?|file):/i;
// Mermaid (`#47;`) and HTML (`&#47;`, `&sol;`, `&Tab;`) decode these into the characters checked
// above; HTML decodes a numeric one even without its semicolon (`&#47`).
const ENCODED_CHARACTER = /&#|[#&][a-z0-9]+;/i;
// A color right after a style property, `fill:#333;`, is not one: whatever it decodes to follows a
// colon, so it can neither start `//` nor complete a scheme.
const STYLE_COLOR = /:\s*#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8});/gi;

/**
 * @cc [owner:PopDaph,label:security] mermaid-chart-names-no-other-site
 * A chart MUST be reported unsafe when, once tabs and line breaks are removed, it contains `//`,
 * `\`, a network scheme followed by `:` (`http`, `https`, `ftp`, `ftps`, `ws`, `wss`, `file`), `&#`,
 * or a `#...;` or `&...;` encoded character other than a hex color right after a `:`: rendering it
 * could make the browser load from another site. Every other chart MUST be reported safe, whatever its
 * type, styles or labels.
 */
export function isSafeMermaidChart(chart: string): boolean {
  const checked = chart
    .replace(URL_IGNORED_CHARACTERS, "")
    .replace(STYLE_COLOR, ":");
  return (
    !OTHER_SITE_PREFIX.test(checked) &&
    !NETWORK_SCHEME.test(checked) &&
    !ENCODED_CHARACTER.test(checked)
  );
}
