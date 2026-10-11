import type { VisualizationActionIframeProps } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { AuthContext } from "@app/lib/auth/AuthContext";
import type {
  ScopedWorkspaceUserIdentity,
  WorkspaceUserIdentity,
} from "@app/types/assistant/visualization";
import { DEFAULT_LOCALE, isSupportedLocale } from "@app/types/locale";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react";
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

interface AuthenticatedVisualizationActionIframeProps extends Omit<
  VisualizationActionIframeProps,
  "canInvokeFunctions" | "locale" | "scopedUserIdentity" | "viewer"
> {
  isPodEditor?: boolean;
  isPodMember?: boolean;
}

/**
 * @cc [owner:ykmsd,label:product] authenticated-frame-follows-active-locale
 * The Frame MUST receive front's active UI locale (`i18n.locale`, which is `DEFAULT_LOCALE` when the
 * `localisation` flag is off), or `DEFAULT_LOCALE` when that locale is not a `SupportedLocale`
 * (pseudo-locale).
 */
export const AuthenticatedVisualizationActionIframe = forwardRef<
  HTMLIFrameElement,
  AuthenticatedVisualizationActionIframeProps
>(function AuthenticatedVisualizationActionIframe(
  { isPodEditor, isPodMember, ...props },
  ref
) {
  const authContext = useContext(AuthContext);
  const { i18n } = useLingui();
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
      locale={isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE}
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
