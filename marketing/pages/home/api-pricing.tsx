// Page removed from the site, see https://github.com/dust-tt/dust/pull/29781.
// getStaticProps always returns notFound, so the component below never
// renders; it only exists because Next.js requires a default export for
// every file under `pages/`.
export async function getStaticProps() {
  return { notFound: true };
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function ApiPricingPage() {
  return null;
}
