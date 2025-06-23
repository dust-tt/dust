export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/industry/b2b-saas",
      permanent: true,
    },
  };
}

export default function B2BSaaS() {}
