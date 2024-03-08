import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { Workspace } from "@app/lib/models";
import { PlanInvitation } from "@app/lib/models/plan";
import { getCheckoutUrlForUpgrade } from "@app/lib/plans/subscription";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    const owner = auth.workspace();
    if (!owner) {
      return {
        notFound: true,
      };
    }

    const token = context.params?.secret as string;
    if (!token) {
      return {
        notFound: true,
      };
    }

    const invitation = await PlanInvitation.findOne({
      where: {
        secret: token,
      },
    });

    if (!invitation) {
      return {
        notFound: true,
      };
    }

    const targetWorkspace = await Workspace.findOne({
      where: {
        id: invitation.workspaceId,
      },
    });
    if (!targetWorkspace || targetWorkspace.sId !== owner.sId) {
      return {
        notFound: true,
      };
    }

    const { checkoutUrl } = await getCheckoutUrlForUpgrade(auth);
    if (!checkoutUrl) {
      return {
        notFound: true,
      };
    }

    return {
      redirect: {
        destination: checkoutUrl,
        permanent: false,
      },
    };
  }
);

export default function Redirect() {
  return <></>;
}
