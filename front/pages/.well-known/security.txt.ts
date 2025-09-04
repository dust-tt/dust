import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const securityTxt = `Contact: mailto:security@dust.tt
Expires: 2025-12-31T23:59:59.000Z
Preferred-Languages: en
Canonical: https://dust.tt/.well-known/security.txt
Policy: https://dust.tt/home/vulnerability`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.write(securityTxt);
  res.end();

  return { props: {} };
};

export default function SecurityTxt() {
  return null;
}
