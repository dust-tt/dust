import type { SVGProps } from "react";
import * as React from "react";

const SvgMusicNotePlus = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13.465 18a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m-8-8V8.035H3.5a1.035 1.035 0 0 1 0-2.07h1.965V4a1.035 1.035 0 0 1 2.07 0v1.965H9.5a1.035 1.035 0 0 1 0 2.07H7.535V10a1.035 1.035 0 0 1-2.07 0m10.064 8.208a4.035 4.035 0 1 1-2.064-3.732V5.589c0-.408 0-.786.027-1.09.028-.304.094-.695.34-1.047.32-.458.816-.766 1.37-.847l.157-.016c.362-.019.684.083.932.18.285.111.622.28.987.463l3.685 1.842a1.035 1.035 0 0 1-.926 1.852l-3.684-1.842c-.39-.195-.626-.311-.8-.38-.016.186-.018.449-.018.885V18z"
    />
  </svg>
);
export default SvgMusicNotePlus;
