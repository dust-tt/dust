import { SpaceAppsListPage } from "@app/components/pages/spaces/SpaceAppsListPage";
import { spaceGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = SpaceAppsListPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = spaceGetLayout;

export default PageWithAuthLayout;
