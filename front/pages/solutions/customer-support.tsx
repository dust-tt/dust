export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/customer-support",
      permanent: true,
    },
  };
}

export default function CustomerSupport() {}
