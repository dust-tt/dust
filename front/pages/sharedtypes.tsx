import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  gaTrackingId: string;
}> = async () => {
  return {
    props: { gaTrackingId: GA_TRACKING_ID },
  };
};

export default function Home({
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <div>shared types {gaTrackingId}</div>
    </>
  );
}
