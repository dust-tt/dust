import { AnalyticsPage } from "@app/components/pages/workspace/AnalyticsPage";
import { adminGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsForAdmin;

const PageWithAuthLayout = AnalyticsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = adminGetLayout;

export default PageWithAuthLayout;
