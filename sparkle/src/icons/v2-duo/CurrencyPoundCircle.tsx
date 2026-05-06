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
    <g fill="currentColor" clipPath="url(#currency-pound-circle_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M11.693 5.532c1.333-.234 2.905.16 3.812 1.022a1.035 1.035 0 0 1-1.425 1.5c-.355-.337-1.231-.623-2.03-.483-.368.065-.635.207-.806.392-.158.171-.311.462-.313.991.007.482.164.793.434 1.294.173.319.39.714.53 1.217H14a1.035 1.035 0 0 1 0 2.07h-2.044c-.172 1.153-.601 2.166-1.015 2.93H15a1.035 1.035 0 0 1 0 2.07H9a1.036 1.036 0 0 1-.777-1.72l.01-.012q.016-.018.05-.06.07-.083.196-.253c.166-.225.39-.554.614-.96a7.2 7.2 0 0 0 .758-1.995H9a1.035 1.035 0 0 1 0-2.07h.666l-.12-.232c-.277-.51-.672-1.218-.685-2.257v-.014c0-.974.3-1.793.862-2.402.55-.596 1.271-.905 1.97-1.028" />
    </g>
    <defs>
      <clipPath id="currency-pound-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCurrencyPoundCircle;
