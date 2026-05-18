import type { SVGProps } from "react";
import * as React from "react";

const SvgCurrencyRuble = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.465 7.5A2.965 2.965 0 0 0 14.5 4.535H9.535v5.93H14.5A2.965 2.965 0 0 0 17.465 7.5m2.07 0a5.035 5.035 0 0 1-5.035 5.035H9.535v1.93H13.5a1.035 1.035 0 0 1 0 2.07H9.535V20.5a1.035 1.035 0 0 1-2.07 0v-3.965H6.5a1.035 1.035 0 0 1 0-2.07h.965v-1.93H6.5a1.035 1.035 0 0 1 0-2.07h.965V3.5c0-.572.463-1.035 1.035-1.035h6A5.035 5.035 0 0 1 19.535 7.5"
    />
  </svg>
);
export default SvgCurrencyRuble;
