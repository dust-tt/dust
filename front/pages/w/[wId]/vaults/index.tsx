import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

// This endpoint is used as a pass through to redirect to the global vault.
export const getServerSideProps = withDefaultUserAuthRequirements(
  async (context, auth) => {
    const owner = auth.getNonNullableWorkspace();
    const subscription = auth.subscription();

    if (!subscription) {
      return {
        notFound: true,
      };
    }

    const vault = await VaultResource.fetchWorkspaceGlobalVault(auth);
    if (!vault) {
      return {
        notFound: true,
      };
    }

    return {
      redirect: {
        destination: `/w/${owner.sId}/vaults/${vault.sId}`,
        permanent: false,
      },
    };
  }
);

export default function DefaultVault() {}
