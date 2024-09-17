export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/knowledge",
      permanent: true,
    },
  };
}

export default function Knowledge() {}
