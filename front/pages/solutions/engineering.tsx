export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/engineering",
      permanent: true,
    },
  };
}

export default function Engineering() {}
