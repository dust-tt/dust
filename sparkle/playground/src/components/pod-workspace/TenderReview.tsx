import { Button, TextArea } from "@dust-tt/sparkle";
import { useState } from "react";

import { audienceFor, podSources, type WorkspaceState } from "./engine";
import type { WorkspaceFile } from "./model";

export function TenderReview({
  file,
  state,
  onSave,
}: {
  file: WorkspaceFile;
  state: WorkspaceState;
  onSave: (topic: string, answer: string, sourceId: string) => void;
}) {
  const [topic, setTopic] = useState("Regional hosting");
  const [answer, setAnswer] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [saved, setSaved] = useState(false);
  const audience = audienceFor(state.files, file.id);
  const sources = podSources(state, "northstar-tender").filter(
    (source) =>
      ["document", "email", "recording"].includes(source.kind) &&
      !source.sourceIds?.length &&
      [...audience].every((name) =>
        audienceFor(state.files, source.id).has(name)
      )
  );
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">Resolve a requirement</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Add a reviewed answer and its supporting source. Prepare the response
        again to update the draft and coverage review.
      </p>
      <label className="text-xs">
        Requirement
        <select
          aria-label="Requirement"
          className="mt-2 block w-full rounded-lg border border-border bg-background p-2 text-sm"
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            setSaved(false);
          }}
        >
          <option>Regional hosting</option>
          <option>Pricing and SLA</option>
        </select>
      </label>
      <label className="text-xs">
        Supporting source
        <select
          aria-label="Supporting source"
          className="mt-2 block w-full rounded-lg border border-border bg-background p-2 text-sm"
          value={sourceId}
          onChange={(event) => {
            setSourceId(event.target.value);
            setSaved(false);
          }}
        >
          <option value="">Choose an accessible source</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>
      <TextArea
        aria-label="Reviewed answer"
        placeholder="Write the answer you have verified with this source"
        value={answer}
        onChange={(event) => {
          setAnswer(event.target.value);
          setSaved(false);
        }}
        minRows={3}
        resize="vertical"
      />
      <Button
        label="Save reviewed answer"
        variant="outline"
        disabled={!sourceId || !answer.trim()}
        onClick={() => {
          onSave(topic, answer.trim(), sourceId);
          setSaved(true);
        }}
      />
      {saved && (
        <p role="status" className="text-xs text-muted-foreground">
          Answer saved. Update the response to include it.
        </p>
      )}
      {!!file.approvedAnswers?.length && (
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {file.approvedAnswers.map((item) => (
            <li key={item.topic}>{item.topic} · Reviewed answer saved</li>
          ))}
        </ul>
      )}
    </section>
  );
}
