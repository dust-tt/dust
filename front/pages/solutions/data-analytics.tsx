export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/dust-analytics",
      permanent: true,
    },
  };
}

export default function DustAnalytics() {}
