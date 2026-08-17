import type { VisualizationActionIframeProps } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { AuthContext } from "@app/lib/auth/AuthContext";
import type {
  ScopedWorkspaceUserIdentity,
  WorkspaceUserIdentity,
} from "@app/types/assistant/visualization";
import type { LightWorkspaceType } from "@app/types/user";
import { forwardRef, useContext } from "react";

interface WorkspaceAuthIdentity {
  user: WorkspaceUserIdentity;
  workspace: Pick<LightWorkspaceType, "role" | "sId">;
}

export function getAuthenticatedFrameUserIdentity(
  authContext: WorkspaceAuthIdentity | null,
  workspaceId: string,
  // Editorship and membership of the pod hosting the frame, when the host knows them (pod tabs,
  // pinned banner, frame sheet). Display-only: invocations are re-authorized server-side.
  isPodEditor = false,
  isPodMember = false
): ScopedWorkspaceUserIdentity | undefined {
  if (
    !authContext ||
    authContext.workspace.sId !== workspaceId ||
    authContext.workspace.role === "none"
  ) {
    return undefined;
  }

  return {
    workspaceId,
    isPodEditor,
    isPodMember,
    user: {
      sId: authContext.user.sId,
      firstName: authContext.user.firstName,
      lastName: authContext.user.lastName,
      fullName: authContext.user.fullName,
      image: authContext.user.image,
    },
  };
}

interface AuthenticatedVisualizationActionIframeProps
  extends Omit<
    VisualizationActionIframeProps,
    "canInvokeFunctions" | "scopedUserIdentity" | "viewer"
  > {
  isPodEditor?: boolean;
  isPodMember?: boolean;
}

export const AuthenticatedVisualizationActionIframe = forwardRef<
  HTMLIFrameElement,
  AuthenticatedVisualizationActionIframeProps
>(function AuthenticatedVisualizationActionIframe(
  { isPodEditor, isPodMember, ...props },
  ref
) {
  const authContext = useContext(AuthContext);
  const scopedUserIdentity = getAuthenticatedFrameUserIdentity(
    authContext,
    props.workspaceId,
    isPodEditor,
    isPodMember
  );

  return (
    <VisualizationActionIframe
      {...props}
      ref={ref}
      canInvokeFunctions={scopedUserIdentity !== undefined}
      scopedUserIdentity={scopedUserIdentity}
      viewer={
        authContext && scopedUserIdentity
          ? { owner: authContext.workspace, user: authContext.user }
          : null
      }
    />
  );
});
