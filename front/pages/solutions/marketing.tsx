export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/marketing",
      permanent: true,
    },
  };
}

export default function Marketing() {}
