import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyRupeeCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-rupee-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12M15.5 5.465a1.035 1.035 0 0 1 0 2.07h-1.78c.26.446.44.932.543 1.43H15.5a1.035 1.035 0 0 1 0 2.07h-1.237a4.6 4.6 0 0 1-.973 2.04 4.05 4.05 0 0 1-2.08 1.306l3.445 2.818a1.035 1.035 0 1 1-1.31 1.602l-5.5-4.5a1.035 1.035 0 0 1 .655-1.836H10l.292-.014c.653-.064 1.107-.346 1.418-.714.17-.2.304-.44.402-.702H8.5a1.035 1.035 0 0 1 0-2.07h3.612a2.4 2.4 0 0 0-.402-.702c-.311-.368-.765-.65-1.418-.714L10 7.535H8.5a1.035 1.035 0 0 1 0-2.07zM23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="currency-rupee-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyRupeeCircle;
