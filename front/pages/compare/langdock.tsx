// Temporarily redirect to homepage.
export async function getStaticProps() {
  return {
    redirect: {
      destination: "/",
      permanent: false,
    },
  };
}

export default function LangdockComparisonPage() {
  return null;
}
