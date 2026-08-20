import { ConfirmContext } from "@app/components/Confirm";
import { useAppRouter } from "@app/lib/platform";
import { useDeleteApp } from "@app/lib/swr/top_level_apps";
import { getAppRoute, getConversationRoute } from "@app/lib/utils/router";
import type { TopLevelAppType } from "@app/types/api/top_level_apps";
import type { LightWorkspaceType } from "@app/types/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Trash01,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import { useCallback, useContext } from "react";

interface AppMenuProps {
  owner: LightWorkspaceType;
  app: TopLevelAppType;
  trigger: ReactElement;
}

/** The App's row menu in the sidebar, wired like `PodMenu` is on a Pod row. */
export function AppMenu({ owner, app, trigger }: AppMenuProps) {
  const confirm = useContext(ConfirmContext);
  const router = useAppRouter();
  const deleteApp = useDeleteApp({ owner });

  const onDelete = useCallback(async () => {
    const confirmed = await confirm({
      title: `Delete ${app.name}?`,
      message:
        "This permanently removes the App, its conversation and its data. This cannot be undone.",
      validateVariant: "warning",
    });

    if (!confirmed) {
      return;
    }

    const deleted = await deleteApp(app);

    // Leaving the builder of an App that no longer exists would only render its "no longer
    // available" state.
    if (deleted && router.asPath?.startsWith(getAppRoute(owner.sId, app.sId))) {
      void router.push(getConversationRoute(owner.sId));
    }
  }, [confirm, app, deleteApp, router, owner.sId]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          label="Delete"
          icon={Trash01}
          variant="warning"
          onClick={() => void onDelete()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
