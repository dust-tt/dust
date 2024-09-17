export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/security",
      permanent: true,
    },
  };
}

export default function Security() {}
