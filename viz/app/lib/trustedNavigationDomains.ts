export function isTrustedNavigationHostname(
  hostname: string,
  trustedDomains: string[]
): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return trustedDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();

    return (
      normalizedHostname === normalizedDomain ||
      normalizedHostname.endsWith(`.${normalizedDomain}`)
    );
  });
}
