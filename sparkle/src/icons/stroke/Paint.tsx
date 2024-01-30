import type { SVGProps } from "react";
import * as React from "react";
const SvgPaint = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7.293 2.707 9.586 5l-5.879 5.879a3 3 0 0 0 0 4.242l5.172 5.172a3 3 0 0 0 4.242 0L20.414 13 8.707 1.293 7.293 2.707ZM5.12 12.293 11 6.414 17.586 13l-5.879 5.879a1 1 0 0 1-1.414 0L5.12 13.707a1 1 0 0 1 0-1.414Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m20.995 16.964-1.767 1.768a2.5 2.5 0 1 0 3.535 0l-1.768-1.768Z"
    />
  </svg>
);
export default SvgPaint;
