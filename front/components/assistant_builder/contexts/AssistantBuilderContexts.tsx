import { uniqueId } from "lodash";
import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  getAllowedSpaces as getAllowedSpacesOriginal,
  getSpaceIdToActionsMap,
} from "@app/components/agent_builder/get_allowed_spaces";
import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/assistant_builder/contexts/PreviewPanelContext";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { SpacesProvider } from "@app/components/assistant_builder/contexts/SpacesContext";
import type {
  AssistantBuilderInitialState,
  AssistantBuilderMCPOrVizState,
  AssistantBuilderPendingAction,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  getDataVisualizationActionConfiguration,
  getDefaultAssistantState,
} from "@app/components/assistant_builder/types";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type {
  AgentConfigurationScope,
  LightWorkspaceType,
  PlanType,
  SpaceType,
} from "@app/types";
import {
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  GPT_4_1_MINI_MODEL_CONFIG,
} from "@app/types";

interface AssistantBuilderContextType {
  builderState: AssistantBuilderState;
  setBuilderState: React.Dispatch<React.SetStateAction<AssistantBuilderState>>;
  edited: boolean;
  setEdited: (edited: boolean) => void;
  pendingAction: AssistantBuilderPendingAction;
  setAction: (action: AssistantBuilderSetActionType) => void;
  getAllowedSpaces: (action?: AssistantBuilderMCPOrVizState) => SpaceType[];
  nonGlobalSpacesUsedInActions: SpaceType[];
}

function getDefaultBuilderState(
  initialBuilderState: AssistantBuilderInitialState | null,
  defaultScope: Exclude<AgentConfigurationScope, "global">,
  plan: PlanType
) {
  if (initialBuilderState) {
    // We fetch actions on the client side, but in case of duplicating an agent,
    // we need to use the actions from the original agent.
    const duplicatedActions = initialBuilderState.actions.map((action) => ({
      id: uniqueId(),
      ...action,
    }));

    // We need to add data viz as a fake action if it's enabled.
    if (initialBuilderState.visualizationEnabled) {
      duplicatedActions.push(getDataVisualizationActionConfiguration());
    }

    return {
      ...initialBuilderState,
      generationSettings: initialBuilderState.generationSettings ?? {
        ...getDefaultAssistantState().generationSettings,
      },
      actions: duplicatedActions,
    };
  }

  return {
    ...getDefaultAssistantState(),
    scope: defaultScope,
    generationSettings: {
      ...getDefaultAssistantState().generationSettings,
      modelSettings: !isUpgraded(plan)
        ? GPT_4_1_MINI_MODEL_CONFIG
        : CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
    },
  };
}

const AssistantBuilderContext = createContext<AssistantBuilderContextType>({
  builderState: getDefaultAssistantState(),
  setBuilderState: () => {},
  edited: false,
  setEdited: () => {},
  pendingAction: {
    action: null,
    previousActionName: null,
  },
  setAction: () => {},
  getAllowedSpaces: () => [],
  nonGlobalSpacesUsedInActions: [],
});

export const useAssistantBuilderContext = () => {
  const context = useContext(AssistantBuilderContext);
  if (!context) {
    throw new Error(
      "useAssistantBuilderContext must be used within a AssistantBuilderProviders"
    );
  }
  return context;
};

interface AssistantBuilderProviderProps {
  initialBuilderState: AssistantBuilderInitialState | null;
  defaultScope: Exclude<AgentConfigurationScope, "global">;
  plan: PlanType;
  assistantTemplate: FetchAssistantTemplateResponse | null;
  children: ReactNode;
}

interface AssistantBuilderProvidersProps extends AssistantBuilderProviderProps {
  owner: LightWorkspaceType;
}

const AssistantBuilderProvider = ({
  initialBuilderState,
  defaultScope,
  plan,
  assistantTemplate,
  children,
}: AssistantBuilderProviderProps) => {
  const { spaces } = useSpacesContext();
  const { mcpServerViews } = useMCPServerViewsContext();
  const [edited, setEdited] = useState(!!assistantTemplate);

  const [builderState, setBuilderState] = useState<AssistantBuilderState>(
    getDefaultBuilderState(initialBuilderState, defaultScope, plan)
  );

  const [pendingAction, setPendingAction] =
    useState<AssistantBuilderPendingAction>({
      action: null,
      previousActionName: null,
    });

  const setAction = useCallback(
    (p: AssistantBuilderSetActionType) => {
      if (p.type === "pending") {
        setPendingAction({ action: p.action, previousActionName: null });
      } else if (p.type === "edit") {
        setPendingAction({
          action: p.action,
          previousActionName: p.action.name,
        });
      } else if (p.type === "clear_pending") {
        setPendingAction({ action: null, previousActionName: null });
      } else if (p.type === "insert") {
        if (builderState.actions.some((a) => a.name === p.action.name)) {
          return;
        }

        setEdited(true);
        setBuilderState((state) => {
          return {
            ...state,
            actions: [...state.actions, p.action],
          };
        });
      }
    },
    [builderState, setBuilderState, setEdited]
  );

  const configurableActions = builderState.actions;

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(configurableActions, mcpServerViews);
  }, [configurableActions, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((s) => spaceIdToActions[s.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

  const getAllowedSpaces = useCallback(
    (action?: AssistantBuilderMCPOrVizState) => {
      return getAllowedSpacesOriginal({
        action,
        spaces,
        spaceIdToActions,
      });
    },
    [spaces, spaceIdToActions]
  );

  const value = useMemo(
    () => ({
      builderState,
      setBuilderState,
      edited,
      setEdited,
      pendingAction,
      setAction,
      nonGlobalSpacesUsedInActions,
      getAllowedSpaces,
    }),
    [
      builderState,
      setBuilderState,
      edited,
      setEdited,
      pendingAction,
      setAction,
      nonGlobalSpacesUsedInActions,
      getAllowedSpaces,
    ]
  );

  return (
    <AssistantBuilderContext.Provider value={value}>
      {children}
    </AssistantBuilderContext.Provider>
  );
};

export const AssistantBuilderProviders = ({
  owner,
  initialBuilderState,
  defaultScope,
  plan,
  assistantTemplate,
  children,
}: AssistantBuilderProvidersProps) => {
  return (
    <PreviewPanelProvider>
      <SpacesProvider owner={owner}>
        <MCPServerViewsProvider owner={owner}>
          <DataSourceViewsProvider owner={owner}>
            <AssistantBuilderProvider
              initialBuilderState={initialBuilderState}
              defaultScope={defaultScope}
              plan={plan}
              assistantTemplate={assistantTemplate}
            >
              {children}
            </AssistantBuilderProvider>
          </DataSourceViewsProvider>
        </MCPServerViewsProvider>
      </SpacesProvider>
    </PreviewPanelProvider>
  );
};

AssistantBuilderProviders.displayName = "AssistantBuilderProviders";
