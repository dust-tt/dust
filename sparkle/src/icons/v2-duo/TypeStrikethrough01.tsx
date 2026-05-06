import type { SVGProps } from "react";
import * as React from "react";

const SvgTypeStrikethrough01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 6.5V5.035H9.5a1.035 1.035 0 0 1 0-2.07H17c.452 0 .843 0 1.165.021.332.023.665.073.996.21a3.04 3.04 0 0 1 1.643 1.643c.137.33.187.664.21.996.022.322.021.713.021 1.165a1.035 1.035 0 0 1-2.07 0c0-.48 0-.788-.017-1.023-.015-.226-.041-.31-.056-.346a.97.97 0 0 0-.523-.523c-.037-.015-.12-.04-.346-.056A17 17 0 0 0 17 5.035h-3.965V6.5a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M2.965 7V6c0-.46.104-.895.287-1.285L2.27 3.73a1.034 1.034 0 1 1 1.463-1.463l18 18a1.034 1.034 0 1 1-1.463 1.463l-7.233-7.233v4.467H15a1.035 1.035 0 0 1 0 2.07H9a1.035 1.035 0 0 1 0-2.07h1.965v-6.537l-5.93-5.93V7a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgTypeStrikethrough01;
