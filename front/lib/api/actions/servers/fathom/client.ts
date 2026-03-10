import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Fathom } from "fathom-typescript";
import { FathomError } from "fathom-typescript/sdk/models/errors";
import type {
  Meeting,
  MeetingSummary,
  TranscriptItem,
} from "fathom-typescript/sdk/models/shared";

export type FathomListMeetingsOptions = {
  cursor?: string;
  startDate?: string;
  endDate?: string;
  recordingId?: number;
  includeActionItems?: boolean;
  includeCrmMatches?: boolean;
};

export type FathomListMeetingsResult = {
  meetings: Meeting[];
  nextCursor: string | null;
};

export class FathomMCPClient {
  private client: Fathom;

  constructor(accessToken: string) {
    this.client = new Fathom({
      security: {
        bearerAuth: accessToken,
      },
    });
  }

  async listMeetings(
    options: FathomListMeetingsOptions = {}
  ): Promise<Result<FathomListMeetingsResult, Error>> {
    const {
      cursor,
      startDate,
      endDate,
      recordingId,
      includeActionItems,
      includeCrmMatches,
    } = options;

    try {
      const iterator = await this.client.listMeetings({
        cursor,
        createdAfter: startDate,
        createdBefore: endDate,
        includeActionItems: includeActionItems ?? false,
        includeCrmMatches: includeCrmMatches ?? false,
      });

      for await (const page of iterator) {
        if (!page) {
          break;
        }
        const items = page.result?.items ?? [];
        const nextCursor = page.result?.nextCursor ?? null;
        const meetings =
          recordingId !== undefined
            ? items.filter((m) => m.recordingId === recordingId)
            : items;
        return new Ok({ meetings, nextCursor });
      }

      return new Ok({ meetings: [], nextCursor: null });
    } catch (error) {
      if (error instanceof FathomError) {
        return new Err(new Error(`Fathom API error: ${error.message}`));
      }
      return new Err(normalizeError(error));
    }
  }

  async getSummary(
    recordingId: number
  ): Promise<Result<MeetingSummary | null, Error>> {
    try {
      const response = await this.client.getRecordingSummary({ recordingId });
      if (!response) {
        return new Ok(null);
      }
      if ("summary" in response) {
        return new Ok(response.summary);
      }
      return new Ok(null);
    } catch (error) {
      if (error instanceof FathomError) {
        return new Err(new Error(`Fathom API error: ${error.message}`));
      }
      return new Err(normalizeError(error));
    }
  }

  async getTranscript(
    recordingId: number
  ): Promise<Result<TranscriptItem[], Error>> {
    try {
      const response = await this.client.getRecordingTranscript({
        recordingId,
        destinationUrl: "",
      });
      if (!response || !("transcript" in response)) {
        return new Ok([]);
      }
      return new Ok(response.transcript);
    } catch (error) {
      if (error instanceof FathomError) {
        return new Err(new Error(`Fathom API error: ${error.message}`));
      }
      return new Err(normalizeError(error));
    }
  }
}
