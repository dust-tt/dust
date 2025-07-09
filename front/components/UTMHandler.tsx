"use client";

import { useEffect } from "react";

interface Props {
  utmParams?: { [key: string]: string | string[] | undefined };
}

const UTMHandler = ({ utmParams }: Props) => {
  useEffect(() => {
    if (utmParams && Object.keys(utmParams)?.length > 0) {
      try {
        sessionStorage?.setItem("utm_data", JSON.stringify(utmParams));
      } catch (error) {
        console.error("Error storing UTM parameters:", error);
      }
    }
  }, [utmParams]);

  return null;
};

export default UTMHandler;
