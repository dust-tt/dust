import { Spinner } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useState } from "react";
import type { KeyedMutator } from "swr";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

interface PokeDataTableConditionalFetchProps<T, M> {
  buttonText?: string;
  children: (data: T, mutate: KeyedMutator<M>) => React.ReactNode;
  globalActions?: React.ReactNode;
  header: string;
  loadOnInit?: boolean;
  owner: LightWorkspaceType;
  useSWRHook: (props: PokeConditionalFetchProps) => {
    data: T;
    isError: any;
    isLoading: boolean;
    mutate: KeyedMutator<M>;
  };
}

export function PokeDataTableConditionalFetch<T, M>({
  buttonText = "Load Data",
  children,
  globalActions,
  header,
  loadOnInit = false,
  owner,
  useSWRHook,
}: PokeDataTableConditionalFetchProps<T, M>) {
  const [shouldLoad, setShouldLoad] = useState(loadOnInit);
  const { data, isLoading, isError, mutate } = useSWRHook({
    owner,
    disabled: !shouldLoad,
  });

  const handleLoadClick = () => {
    setShouldLoad(true);
  };

  let content;

  if (!shouldLoad) {
    content = (
      <div className="flex justify-center">
        <PokeButton onClick={handleLoadClick} variant="outline">
          {buttonText}
        </PokeButton>
      </div>
    );
  } else if (isLoading) {
    content = (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (isError) {
    content = (
      <div className="flex h-32 items-center justify-center">
        <p>Error loading data.</p>
      </div>
    );
  } else {
    content = children(data, mutate);
  }

  return (
    <div className="border-material-200 my-4 flex min-h-48 flex-col rounded-lg border bg-slate-100">
      <div className="flex justify-between gap-3 rounded-t-lg bg-slate-300 p-4">
        <h2 className="text-md font-bold">{header} :</h2>
        {globalActions}
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {content}
      </div>
    </div>
  );
}
