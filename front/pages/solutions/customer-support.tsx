export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/customer-support",
      permanent: true,
    },
  };
}

export default function CustomerSupport() {}
