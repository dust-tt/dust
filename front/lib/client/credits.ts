// Format a number of AWU credits for display (thousands separators, at most
// one decimal). Shared across the credits usage table and the message /
// conversation cost menu entries.
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatCreditsCompact(credits: number): string {
  return credits.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatMicroUsdCompact(microUsd: number): string {
  const dollars = microUsd / 1_000_000;
  return `$${dollars.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
}
