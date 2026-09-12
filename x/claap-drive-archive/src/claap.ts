import type { ClaapPort, ClaapRecording, ClaapTranscript } from "./types.ts";

const DEFAULT_BASE_URL = "https://api.claap.io";

type ClaapEnvelope<T> = { result: T };

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 500) || response.statusText;
}

export function createClaapClient(
  apiKey: string,
  baseUrl = DEFAULT_BASE_URL
): ClaapPort {
  async function request<T>(
    path: string,
    searchParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Claap-Key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Claap ${response.status} ${url.pathname}: ${await readError(response)}`
      );
    }

    return (await response.json()) as T;
  }

  return {
    async getRecording(recordingId) {
      const payload = await request<ClaapEnvelope<{ recording: ClaapRecording }>>(
        `v1/recordings/${encodeURIComponent(recordingId)}`
      );
      return payload.result.recording;
    },

    async getTranscript(recordingId) {
      const payload = await request<
        ClaapEnvelope<{ transcript: ClaapTranscript }>
      >(`v1/recordings/${encodeURIComponent(recordingId)}/transcript`, {
        format: "json",
      });
      return payload.result.transcript;
    },

    async listRecordings(params = {}) {
      const payload = await request<
        ClaapEnvelope<{
          recordings: ClaapRecording[];
          pagination: { nextCursor?: string; totalCount: number };
        }>
      >("v1/recordings", {
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
        cursor: params.cursor,
        limit: params.limit ?? 50,
        recorderEmail: params.recorderEmail,
        sort: "created_asc",
      });
      return {
        recordings: payload.result.recordings,
        nextCursor: payload.result.pagination.nextCursor,
      };
    },
  };
}
