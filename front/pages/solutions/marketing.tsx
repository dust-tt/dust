export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/marketing",
      permanent: true,
    },
  };
}

export default function Marketing() {}
