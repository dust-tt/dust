import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  isSupportedLocale,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
} from "@app/types/locale";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";

export const setWorkspaceLocalePlugin = createPlugin({
  manifest: {
    id: "set-workspace-locale",
    name: "Set Workspace Locale",
    description:
      "Change the default locale of the workspace. Members who did not pick a locale use it.",
    resourceTypes: ["workspaces"],
    args: {
      locale: {
        type: "enum",
        label: "Locale",
        description: "The new default locale of the workspace.",
        values: mapToEnumValues(SUPPORTED_LOCALES, (locale) => ({
          label: `${LOCALE_LABELS[locale]} (${locale})`,
          value: locale,
        })),
        multiple: false,
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (_, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const locale = args.locale[0];
    if (!isSupportedLocale(locale)) {
      return new Err(new Error("Please select a locale."));
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    await workspaceResource.updateWorkspaceSettings({ locale });

    return new Ok({
      display: "text",
      value: `Workspace locale set to ${locale}.`,
    });
  },
});
