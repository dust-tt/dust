import type { SVGProps } from "react";
import * as React from "react";
const SvgDustLogoSquare = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 48 48"
    {...props}
  >
    <path fill="#FFAA0D" d="M36 24H24v24h12V24Z" />
    <path
      fill="#3B82F6"
      fillRule="evenodd"
      d="M12 36a6 6 0 0 1 0-12h36v12H12Z"
      clipRule="evenodd"
    />
    <path
      fill="#9FDBFF"
      fillRule="evenodd"
      d="M0 48V36h12a6 6 0 0 1 0 12H0Z"
      clipRule="evenodd"
    />
    <path
      fill="#E2F78C"
      d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12Z"
    />
    <path
      fill="#FFC3DF"
      d="M36 24c6.627 0 12-5.373 12-12S42.627 0 36 0 24 5.373 24 12s5.373 12 12 12Z"
    />
    <path fill="#418B5C" d="M12 0H0v24h12V0Z" />
    <path fill="#E14322" d="M48 0H24v12h24V0Z" />
  </svg>
);
export default SvgDustLogoSquare;
