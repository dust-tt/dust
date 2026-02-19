import { AppViewPage } from "@app/components/pages/spaces/apps/AppViewPage";
import { dustAppGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = AppViewPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = dustAppGetLayout;

export default PageWithAuthLayout;
