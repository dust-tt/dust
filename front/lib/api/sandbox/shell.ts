// Single-quote a value for safe interpolation into a /bin/sh command string.
// Sandbox helpers build commands by concatenation rather than passing argv,
// so every untrusted segment must flow through this.
export function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
