import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyDollar = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.965 16A2.965 2.965 0 0 0 14 13.035h-.965v5.93H14A2.965 2.965 0 0 0 16.965 16m0-8A2.965 2.965 0 0 0 14 5.035h-.965v5.93H14a5.035 5.035 0 0 1 0 10.07h-.965V22a1.035 1.035 0 0 1-2.07 0v-.965H10A5.035 5.035 0 0 1 4.965 16a1.035 1.035 0 0 1 2.07 0A2.965 2.965 0 0 0 10 18.965h.965v-5.93H10a5.035 5.035 0 0 1 0-10.07h.965V2a1.035 1.035 0 0 1 2.07 0v.965H14A5.035 5.035 0 0 1 19.035 8a1.035 1.035 0 0 1-2.07 0m-9.93 0A2.965 2.965 0 0 0 10 10.965h.965v-5.93H10A2.965 2.965 0 0 0 7.035 8"
    />
  </svg>
);
export default SvgCurrencyDollar;
