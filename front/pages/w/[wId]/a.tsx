import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { VaultResource } from "@app/lib/resources/vault_resource";

// This page is temporarily kept to redirect users to the global vault.
// It should be removed once the legacy non-vault UI is removed.

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
        destination: `/w/${owner.sId}/vaults/${vault.sId}/categories/apps`,
        permanent: false,
      },
    };
  }
);

export default function DefaultApps() {}
