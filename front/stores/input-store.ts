import { createStore } from "zustand/vanilla";

export type InputState = {
  draft: string;
};

export type InputActions = {
  setDraft: (draft: string) => void;
};

export type InputStore = InputState & InputActions;

export const defaultInitState: InputState = {
  draft: "",
};

export const createInputStore = (initState: InputState = defaultInitState) => {
  return createStore<InputStore>()((set) => ({
    ...initState,
    setDraft: (draft: string) => set(() => ({ draft })),
  }));
};
