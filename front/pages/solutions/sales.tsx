export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/sales",
      permanent: true,
    },
  };
}

export default function Sales() {}
