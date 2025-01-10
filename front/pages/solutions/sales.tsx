export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/sales",
      permanent: true,
    },
  };
}

export default function Sales() {}
