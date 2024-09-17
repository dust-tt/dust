export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/solutions/dust-platform",
      permanent: true,
    },
  };
}

export default function DustPlatform() {}
