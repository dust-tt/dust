// Format a number of AWU credits for display (thousands separators, at most
// one decimal). Shared across the credits usage table and the message /
// conversation cost menu entries.
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
