import assert from "assert";

import { DEFAULT_SEARCH_LABELS_ACTION_NAME } from "@app/lib/actions/constants";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import type { BaseActionRunParams } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { dustAppRunInputsToInputSchema } from "@app/lib/actions/types/agent";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { AgentSearchLabelsAction } from "@app/lib/models/assistant/actions/search_labels";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import type {
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@app/types";
import { isString } from "@app/types";
import { CoreAPI, Ok } from "@app/types";

const DEFAULT_SEARCH_LABELS_LIMIT = 10;

export type SearchLabelsConfigurationType = {
  id: ModelId;
  sId: string;

  type: "search_labels_configuration";

  name: string;
  description?: string;

  // Used to scope the search results to a specific set of data sources.
  dataSourceViewIds: string[];

  parentTool: string;
};

interface SearchLabelsResultType {
  tag: string;
  match_count: number;
  data_sources: string[];
}

export interface SearchLabelsActionOutputType {
  tags: SearchLabelsResultType[];
}

// Event sent before the execution with the finalized params to be used.
type SearchLabelsParamsEvent = {
  type: "search_labels_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: SearchLabelsActionType;
};

type SearchLabelsErrorEvent = {
  type: "search_labels_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

type SearchLabelsSuccessEvent = {
  type: "search_labels_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: SearchLabelsActionType;
};

export type SearchLabelsActionRunningEvents = SearchLabelsParamsEvent;

type SearchLabelsActionBlob = ExtractActionBlob<SearchLabelsActionType>;

export class SearchLabelsActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly output: SearchLabelsActionOutputType | null;
  readonly parentTool: string;
  readonly searchText: string;
  readonly step: number;

  readonly type = "search_labels_action";

  constructor(blob: SearchLabelsActionBlob) {
    super(blob.id, "search_labels_action");

    this.agentMessageId = blob.agentMessageId;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName =
      blob.functionCallName ?? DEFAULT_SEARCH_LABELS_ACTION_NAME;
    this.parentTool = blob.parentTool;
    this.searchText = blob.searchText;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_SEARCH_LABELS_ACTION_NAME,
      arguments: JSON.stringify({ searchText: this.searchText }),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    let content = "";
    if (this.output === null) {
      content = "No tags found.";
    } else {
      content = "Available tags:\n";
      for (const tag of this.output.tags) {
        content += `- ${tag.tag} (available in ${tag.data_sources.length} data sources)\n`;
      }
    }

    return {
      role: "function",
      name: this.functionCallName ?? DEFAULT_SEARCH_LABELS_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class SearchLabelsConfigurationServerRunner extends BaseActionConfigurationServerRunner<SearchLabelsConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    {
      description,
      name,
    }: {
      description: string | null;
      name: string;
    }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const inputs = [
      {
        name: "searchText",
        description:
          "The text to search for in existing labels using edge ngram matching (case-insensitive). " +
          "Matches labels that start with any word in the search text. " +
          "The returned labels can be used in tagsIn/tagsNot parameters to restrict or exclude content " +
          "based on the user request and conversation context.",
        type: "string" as const,
      },
    ];
    return new Ok({
      name,
      description:
        description ||
        `Find exact matching labels before using them in the tool ${this.actionConfiguration.parentTool}. ` +
          "Restricting or excluding content succeeds only with existing labels. " +
          "Searching without verifying labels first typically returns no results.",
      inputs: inputs,
      inputSchema: dustAppRunInputsToInputSchema(inputs),
    });
  }

  async *run(
    auth: Authenticator,
    { agentMessage, rawInputs, functionCallId, step }: BaseActionRunParams
  ): AsyncGenerator<
    SearchLabelsParamsEvent | SearchLabelsSuccessEvent | SearchLabelsErrorEvent,
    void
  > {
    const { actionConfiguration } = this;

    const { searchText } = rawInputs;

    if (!isString(searchText)) {
      yield {
        type: "search_labels_error",
        created: Date.now(),
        configurationId: actionConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "search_labels_parameters_generation_error",
          message:
            "The searchText parameter is required and must be a valid string.",
        },
      };

      return;
    }

    // Fetch data source views to get dustAPIDataSourceIds.
    const dataSourceViews = await DataSourceViewResource.fetchByIds(
      auth,
      this.actionConfiguration.dataSourceViewIds
    );

    // Ensure the auth can read all the data source views.
    assert(
      dataSourceViews.some((dsv) => dsv.canRead(auth)),
      "Unauthorized attempt to read data source view in `search_labels` action"
    );

    assert(
      dataSourceViews.length > 0,
      "No data source views found for `search_labels` action"
    );

    const action = await AgentSearchLabelsAction.create({
      agentMessageId: agentMessage.agentMessageId,
      functionCallId,
      output: null,
      parentTool: actionConfiguration.parentTool,
      searchText,
      step,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    yield {
      type: "search_labels_params",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new SearchLabelsActionType({
        agentMessageId: action.agentMessageId,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        id: action.id,
        output: null,
        parentTool: actionConfiguration.parentTool,
        searchText,
        step: action.step,
        type: "search_labels_action",
        generatedFiles: [],
      }),
    };

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const result = await coreAPI.searchTags({
      dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
      limit: DEFAULT_SEARCH_LABELS_LIMIT,
      query: searchText,
      queryType: "match",
    });

    if (result.isErr()) {
      yield {
        type: "search_labels_error",
        created: Date.now(),
        configurationId: actionConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "search_labels_execution_error",
          message: result.error.message,
        },
      };

      return;
    }

    await action.update({
      output: result.value,
    });

    yield {
      type: "search_labels_success",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new SearchLabelsActionType({
        agentMessageId: action.agentMessageId,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        id: action.id,
        output: action.output,
        parentTool: actionConfiguration.parentTool,
        searchText: action.searchText,
        step: action.step,
        type: "search_labels_action",
        generatedFiles: [],
      }),
    };
  }
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a actions from AgentMessage ModelIds. This
// should not be used outside of api/assistant. We allow a ModelId interface here because for
// optimization purposes to avoid duplicating DB requests while having clear action specific code.
export async function searchLabelsActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<SearchLabelsActionType[]> {
  const models = await AgentSearchLabelsAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new SearchLabelsActionType({
      agentMessageId: action.agentMessageId,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      id: action.id,
      output: action.output,
      parentTool: action.parentTool,
      searchText: action.searchText,
      step: action.step,
      type: "search_labels_action",
      generatedFiles: [],
    });
  });
}
