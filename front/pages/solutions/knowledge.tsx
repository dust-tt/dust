export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/knowledge",
      permanent: true,
    },
  };
}

export default function Knowledge() {}
