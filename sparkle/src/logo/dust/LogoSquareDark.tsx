import type { SVGProps } from "react";
import * as React from "react";
const SvgLogoSquareDark = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 48 48"
    {...props}
  >
    <path
      fill="#1E293B"
      fillOpacity={0.7}
      fillRule="evenodd"
      d="M12 24c6.627 0 12-5.373 12-12 0 6.627 5.373 12 12 12s12-5.373 12-12S42.627 0 36 0 24 5.373 24 12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12Zm24 12H24v12h12V36ZM12 48a6 6 0 0 0 0-12H0v12h12Z"
      clipRule="evenodd"
    />
    <path
      fill="#1E293B"
      fillRule="evenodd"
      d="M12 0H0v24h12a6 6 0 0 0 0 12h36V24H12V0Zm12 0h24v12H24V0Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLogoSquareDark;
