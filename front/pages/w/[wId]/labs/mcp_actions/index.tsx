import { MCPActionsDashboardPage } from "@app/components/pages/workspace/labs/mcp_actions/MCPActionsDashboardPage";
import { appGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForAdmin;

const PageWithAuthLayout = MCPActionsDashboardPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = appGetLayout;

export default PageWithAuthLayout;
