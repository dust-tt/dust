export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/security",
      permanent: true,
    },
  };
}

export default function Security() {}
