import { CreditsUsagePage } from "@app/components/pages/workspace/developers/CreditsUsagePage";
import { adminGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForAdmin;

const PageWithAuthLayout = CreditsUsagePage as AppPageWithLayout;

PageWithAuthLayout.getLayout = adminGetLayout;

export default PageWithAuthLayout;
