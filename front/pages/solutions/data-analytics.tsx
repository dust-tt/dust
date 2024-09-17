export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/dust-analytics",
      permanent: true,
    },
  };
}

export default function DustAnalytics() {}
