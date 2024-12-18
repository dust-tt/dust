import type { ReactElement } from "react";
import { Page } from "@dust-tt/sparkle";
import { NextPageWithLayout } from "./_app";
import AppLayout from "@app/src/components/Layout";

const Home: NextPageWithLayout = () => {
  return (
    <Page>
      <Page.Header
        title="Workspace Resolver"
        description="Handles workspace discovery and routing"
      />
      <Page.P>Service is up and running</Page.P>
    </Page>
  );
};

Home.getLayout = (page: ReactElement) => {
  return <AppLayout>{page}</AppLayout>;
};

export default Home;
