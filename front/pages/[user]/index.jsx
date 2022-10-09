export default function Redirect() {
  return <></>;
}

export async function getServerSideProps(context) {
  return {
    redirect: {
      destination: `/${context.query.user}/apps`,
      permanent: false,
    },
  };
}
