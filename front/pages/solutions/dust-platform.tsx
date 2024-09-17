export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/site/solutions/dust-platform",
      permanent: true,
    },
  };
}

export default function DustPlatform() {}
