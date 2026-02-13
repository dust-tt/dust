import { DatasetPage } from "@app/components/pages/spaces/apps/DatasetPage";
import { dustAppGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = DatasetPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = dustAppGetLayout;

export default PageWithAuthLayout;
