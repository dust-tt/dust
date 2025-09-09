import { BookOpenIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { FormEvent, ReactElement } from "react";
import { useRef, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type {
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  featureFlags: WhitelistableFeature[];
}>(async (_, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("simple_audio_transcription")) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      featureFlags,
    },
  };
});

export default function LabsTranscriptionIndex({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const wId = owner.sId;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useStreaming, setUseStreaming] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [partial, setPartial] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setError(null);
    setTranscript("");
    setPartial("");
  };

  const handleCancel = () => {
    const a = abortRef.current;
    if (a) {
      a.abort();
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    reset();
    if (!selectedFile) {
      setError("Please select an audio file.");
      return;
    }

    const form = new FormData();
    form.append("file", selectedFile);
    const resp = await fetch(
      `/api/w/${wId}/services/transcribe?stream=${useStreaming}`,
      {
        method: "POST",
        body: form,
      }
    );

    try {
      setIsLoading(true);
      if (useStreaming) {
        // Streamed transcription: POST raw audio and parse SSE response.
        abortRef.current = new AbortController();
        setPartial("");
        setTranscript("");
        if (!resp.ok || !resp.body) {
          const msg = await resp.text();
          throw new Error(msg || "Failed to stream transcription.");
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // Read until stream ends or aborted.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          // Parse SSE messages separated by double newlines.
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            if (!part) {
              continue;
            }
            if (part === "data: done") {
              break;
            }

            const payload = JSON.parse(part.replace("data: ", "")) as {
              type: string;
              delta?: string;
              fullTranscript?: string;
            };
            if (payload.type === "delta") {
              setPartial((p) => p + payload.delta);
            } else if (payload.type === "fullTranscript") {
              setTranscript(payload.fullTranscript!);
            }
          }
        }
      } else {
        const json = (await resp.json()) as { text?: string };
        setTranscript(json.text || "");
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <ConversationsNavigationProvider>
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Transcription tools"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Page>
          <Page.Header title="Transcriptions tools" icon={BookOpenIcon} />
          <Page.Layout direction="vertical">
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                maxWidth: 640,
              }}
            >
              <label>
                Audio file
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0] || null;
                    setSelectedFile(f);
                  }}
                  disabled={isLoading}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.currentTarget.checked)}
                  disabled={isLoading}
                />
                Stream results
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={isLoading || !selectedFile}>
                  {isLoading
                    ? useStreaming
                      ? "Streaming…"
                      : "Transcribing…"
                    : "Transcribe"}
                </button>
                {isLoading ? (
                  <button type="button" onClick={handleCancel}>
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={reset}
                    disabled={!transcript && !partial && !error}
                  >
                    Reset
                  </button>
                )}
              </div>

              {error ? (
                <div style={{ color: "red" }}>Error: {error}</div>
              ) : null}

              {useStreaming && (partial || isLoading) ? (
                <div>
                  <div style={{ fontWeight: 600 }}>Partial transcript</div>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{partial}</pre>
                </div>
              ) : null}

              {transcript ? (
                <div>
                  <div style={{ fontWeight: 600 }}>Final transcript</div>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{transcript}</pre>
                </div>
              ) : null}
            </form>
          </Page.Layout>
        </Page>
      </AppCenteredLayout>
    </ConversationsNavigationProvider>
  );
}

LabsTranscriptionIndex.getLayout = (page: ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
