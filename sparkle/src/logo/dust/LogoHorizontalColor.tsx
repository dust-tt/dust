import type { SVGProps } from "react";
import * as React from "react";
const SvgLogoHorizontalColor = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 96 24"
    {...props}
  >
    <path fill="#FCD34D" d="M84 12H72v12h12V12Z" />
    <path
      fill="#6EE7B7"
      d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12Z"
    />
    <path
      fill="#F9A8D4"
      d="M36 24c6.627 0 12-5.373 12-12S42.627 0 36 0 24 5.373 24 12s5.373 12 12 12Z"
    />
    <path fill="#10B981" d="M12 0H0v24h12V0Z" />
    <path fill="#F87171" d="M48 0H24v12h24V0Z" />
    <path
      fill="#3B82F6"
      fillRule="evenodd"
      d="M60 12a6 6 0 0 1 0-12h36v12H60Z"
      clipRule="evenodd"
    />
    <path
      fill="#7DD3FC"
      fillRule="evenodd"
      d="M48 24V12h12a6 6 0 0 1 0 12H48Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLogoHorizontalColor;
