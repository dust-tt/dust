import { AppSettingsPage } from "@app/components/pages/spaces/apps/AppSettingsPage";
import { appGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = AppSettingsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = appGetLayout;

export default PageWithAuthLayout;
