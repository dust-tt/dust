export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/engineering",
      permanent: true,
    },
  };
}

export default function Engineering() {}
