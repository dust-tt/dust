// cac parses the short alias of a `--no-*` option as `true` instead of negating the option, so
// `-F` would leave forwarding on. Rewrite each alias to its long form before parsing.
const NEGATED_SHORT_FLAGS: Readonly<Record<string, string>> = {
  "-A": "--no-attach",
  "-F": "--no-forward",
  "-O": "--no-open",
};

export function expandNegatedShortFlags(argv: readonly string[]): string[] {
  return argv.map((arg) => NEGATED_SHORT_FLAGS[arg] ?? arg);
}
