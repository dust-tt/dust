import { RunsPage } from "@app/components/pages/spaces/apps/RunsPage";
import { dustAppGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = RunsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = dustAppGetLayout;

export default PageWithAuthLayout;
