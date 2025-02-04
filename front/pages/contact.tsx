export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/home/contact",
      permanent: true,
    },
  };
}

export default function Contact() {}
