"use client";

import { useSearchParams } from "next/navigation";

import UTMHandler from "@app/components/UTMHandler";
import { extractUTMParams } from "@app/lib/utils/utm";

interface Props {
  children: React.ReactNode;
}

const UTMPageWrapper = ({ children }: Props) => {
  const searchParams = useSearchParams();

  const utmParams = (() => {
    const paramsObj: { [key: string]: string | string[] | undefined } = {};
    searchParams?.forEach((value, key) => {
      paramsObj[key] = value;
    });
    return extractUTMParams(paramsObj);
  })();

  return (
    <>
      {Object.keys(utmParams).length > 0 && (
        <UTMHandler utmParams={utmParams} />
      )}
      {children}
    </>
  );
};

export default UTMPageWrapper;
