import { DEFAULT_RETRIEVAL_ACTION_NAME } from "@app/lib/actions/constants";
import type { ExtractActionBlob } from "@app/lib/actions/types";
import { BaseAction } from "@app/lib/actions/types";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type {
  DataSourceViewType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  TimeFrame,
} from "@app/types";

/**
 * Retrieval configuration
 */

/**
 * Retrieval action
 */

export interface RetrievalDocumentChunkType {
  offset: number;
  score: number | null;
  text: string;
}

export interface RetrievalDocumentType {
  chunks: RetrievalDocumentChunkType[];
  documentId: string;
  dataSourceView: DataSourceViewType | null;
  id: ModelId;
  reference: string; // Short random string so that the model can refer to the document.
  score: number | null;
  sourceUrl: string | null;
  tags: string[];
  timestamp: number;
}

// Event sent during retrieval with the finalized query used to retrieve documents.
type RetrievalParamsEvent = {
  type: "retrieval_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: DataSourceConfiguration[];
  action: RetrievalActionType;
};

export type RetrievalActionRunningEvents = RetrievalParamsEvent;

type RetrievalActionBlob = ExtractActionBlob<RetrievalActionType>;

export class RetrievalActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    relativeTimeFrame: TimeFrame | null;
    query: string | null;
    topK: number;
    tagsIn: string[] | null;
    tagsNot: string[] | null;
  };
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly documents: RetrievalDocumentType[] | null;
  readonly step: number;
  readonly type = "retrieval_action";

  constructor(blob: RetrievalActionBlob) {
    super(blob.id, blob.type);

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.documents = blob.documents;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    const params: Record<string, any> = {};
    if (this.params.query) {
      params.query = this.params.query;
    }
    if (this.params.relativeTimeFrame) {
      const timeFrame = this.params.relativeTimeFrame;
      params.relativeTimeFrame = `${timeFrame.duration}${timeFrame.unit}`;
    }
    if (this.params.topK) {
      params.topK = this.params.topK;
    }
    if (this.params.tagsIn) {
      params.tagsIn = this.params.tagsIn;
    }
    if (this.params.tagsNot) {
      params.tagsNot = this.params.tagsNot;
    }

    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_RETRIEVAL_ACTION_NAME,
      arguments: JSON.stringify(params),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    let content = "";
    if (!this.documents?.length) {
      content += "(retrieval failed)\n";
    } else {
      for (const d of this.documents) {
        let title = d.documentId;
        for (const t of d.tags) {
          if (t.startsWith("title:")) {
            title = t.substring(6);
            break;
          }
        }

        const dataSourceName = d.dataSourceView
          ? getDataSourceNameFromView(d.dataSourceView)
          : "unknown";

        content += `TITLE: ${title} (data source: ${dataSourceName})\n`;
        content += `REFERENCE: ${d.reference}\n`;
        content += `EXTRACTS:\n`;
        for (const c of d.chunks) {
          content += `${c.text}\n`;
        }
        content += "\n";
      }
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_RETRIEVAL_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}
