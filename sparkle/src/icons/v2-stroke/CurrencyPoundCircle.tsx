import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyPoundCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#currency-pound-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-9.273-6.468c1.334-.234 2.906.16 3.813 1.022a1.035 1.035 0 0 1-1.425 1.5c-.355-.337-1.231-.623-2.03-.483-.368.065-.635.207-.806.392-.158.171-.312.462-.313.991.007.482.164.793.434 1.294.172.319.39.714.53 1.217H14a1.035 1.035 0 0 1 0 2.07h-2.044c-.172 1.153-.601 2.166-1.016 2.93H15a1.035 1.035 0 0 1 0 2.07H9a1.036 1.036 0 0 1-.776-1.72l.01-.012q.016-.018.05-.06a8.779 8.779 0 0 0 .81-1.214 7.2 7.2 0 0 0 .758-1.994H9a1.035 1.035 0 0 1 0-2.07h.666l-.121-.233c-.276-.51-.671-1.217-.685-2.256v-.014c0-.974.3-1.793.863-2.402.55-.596 1.27-.905 1.97-1.028M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="currency-pound-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyPoundCircle;
