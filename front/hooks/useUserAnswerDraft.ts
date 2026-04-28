import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useState } from "react";

interface AnswerDraft {
  selectedOptions: number[];
  customResponse: string;
}

function buildAnswer(draft: AnswerDraft): UserQuestionAnswer | null {
  if (draft.selectedOptions.length > 0) {
    return { selectedOptions: draft.selectedOptions };
  }

  const trimmedCustomResponse = draft.customResponse.trim();

  if (trimmedCustomResponse.length === 0) {
    return null;
  }

  return {
    selectedOptions: [],
    customResponse: trimmedCustomResponse,
  };
}

export function useUserAnswerDraft({ multiSelect }: { multiSelect: boolean }) {
  const [draft, setDraft] = useState<AnswerDraft>({
    selectedOptions: [],
    customResponse: "",
  });

  const answerToSubmit = buildAnswer(draft);

  function selectOption(index: number): UserQuestionAnswer | null {
    if (!multiSelect) {
      const answer = { selectedOptions: [index] };

      setDraft((currentDraft) => ({
        ...currentDraft,
        selectedOptions: [index],
      }));

      return answer;
    }

    setDraft((currentDraft) => {
      const nextSelectedOptions = currentDraft.selectedOptions.includes(index)
        ? currentDraft.selectedOptions.filter((i) => i !== index)
        : [...currentDraft.selectedOptions, index];

      return {
        ...currentDraft,
        selectedOptions: nextSelectedOptions,
      };
    });

    return null;
  }

  function selectCustomResponse() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      selectedOptions: [],
    }));
  }

  function updateCustomResponse(customResponse: string) {
    setDraft({
      selectedOptions: [],
      customResponse,
    });
  }

  function appendCustomResponse(character: string) {
    setDraft((currentDraft) => ({
      selectedOptions: [],
      customResponse: `${currentDraft.customResponse}${character}`,
    }));
  }

  return {
    answerToSubmit,
    appendCustomResponse,
    customResponse: draft.customResponse,
    selectedOptions: draft.selectedOptions,
    selectCustomResponse,
    selectOption,
    updateCustomResponse,
  };
}
