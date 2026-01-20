// Temporarily redirect to homepage.
export async function getServerSideProps() {
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
