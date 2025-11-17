import { Button, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

import type { useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types";

type MutatorType<TData> = ReturnType<
  typeof useSWRWithDefaults<string, TData>
>["mutate"];

interface PokeDataTableConditionalFetchProps<T, M> {
  buttonText?: string;
  children: (data: T, mutate: MutatorType<M>) => React.ReactNode;
  globalActions?: React.ReactNode;
  header: string;
  loadOnInit?: boolean;
  owner: LightWorkspaceType;
  showSensitiveDataWarning?: boolean;
  useSWRHook: (props: PokeConditionalFetchProps) => {
    data: T;
    isError: any;
    isLoading: boolean;
    mutate: MutatorType<M>;
  };
}

export function PokeDataTableConditionalFetch<T, M>({
  buttonText = "Load Data",
  children,
  globalActions,
  header,
  loadOnInit = false,
  owner,
  showSensitiveDataWarning = false,
  useSWRHook,
}: PokeDataTableConditionalFetchProps<T, M>) {
  const [shouldLoad, setShouldLoad] = useState(loadOnInit);
  const { data, isLoading, isError, mutate } = useSWRHook({
    owner,
    disabled: !shouldLoad,
  });

  const handleLoadClick = () => {
    if (showSensitiveDataWarning) {
      if (
        window.confirm(
          "Are you sure you want to access this sensitive user data? (Access will be logged)"
        )
      ) {
        setShouldLoad(true);
      }
    } else {
      setShouldLoad(true);
    }
  };

  let content;

  if (!shouldLoad) {
    content = (
      <div className="flex justify-center">
        <Button
          onClick={handleLoadClick}
          variant="outline"
          label={buttonText}
        />
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
    <div className="border-material-200 my-4 flex min-h-24 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
        <h2 className="text-md font-bold">{header}</h2>
        {globalActions}
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {content}
      </div>
    </div>
  );
}
