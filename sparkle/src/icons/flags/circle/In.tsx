import type { SVGProps } from "react";
import * as React from "react";

const SvgIn = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#FF9811"
      d="M10 0C6.035 0 2.61 2.309.992 5.652h18.016A10 10 0 0 0 10 0"
    />
    <path
      fill="#6DA544"
      d="M10 20c3.965 0 7.39-2.309 9.008-5.652H.992A10 10 0 0 0 10 20"
    />
    <path
      fill="#0052B4"
      fillRule="evenodd"
      d="M10 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5m-1.263 3.419a1.56 1.56 0 0 0 1.098.635l-.317-.719zm1.427.635a1.56 1.56 0 0 0 1.098-.635l-.78-.084zM8.572 9.366a1.56 1.56 0 0 0 0 1.267L9.036 10zm2.392.634.463.633a1.56 1.56 0 0 0 0-1.267zM9.835 8.445c-.45.048-.844.288-1.098.635l.78.085zm.646.72.78-.085a1.56 1.56 0 0 0-1.097-.635z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgIn;
