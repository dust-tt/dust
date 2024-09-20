import { Spinner } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

interface PokeDataTableConditionalFetchProps<T> {
  buttonText?: string;
  children: (data: T) => React.ReactNode;
  header: string;
  owner: LightWorkspaceType;
  useSWRHook: (props: PokeConditionalFetchProps) => {
    data: T;
    isError: any;
    isLoading: boolean;
  };
}

export function PokeDataTableConditionalFetch<T>({
  buttonText = "Load Data",
  children,
  header,
  owner,
  useSWRHook,
}: PokeDataTableConditionalFetchProps<T>) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const { data, isLoading, isError } = useSWRHook({
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
    content = children(data);
  }

  return (
    <div className="border-material-200 my-4 flex min-h-48 flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">{header} :</h2>
      <div className="flex flex-grow flex-col justify-center">{content}</div>
    </div>
  );
}
