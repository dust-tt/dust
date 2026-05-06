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
      d="M5.465 10V8.035H3.5a1.035 1.035 0 0 1 0-2.07h1.965V4a1.035 1.035 0 0 1 2.07 0v1.965H9.5a1.035 1.035 0 0 1 0 2.07H7.535V10a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M13.465 18a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m2.064.208a4.035 4.035 0 1 1-2.064-3.733V5.59c0-.409 0-.786.027-1.091.028-.303.094-.694.34-1.046.32-.459.816-.766 1.37-.848l.157-.015c.362-.019.684.082.932.18.285.11.622.28.987.463l3.685 1.842a1.035 1.035 0 0 1-.926 1.852l-3.684-1.842c-.39-.195-.626-.312-.8-.381-.016.187-.018.45-.018.886v12.41z"
    />
  </svg>
);
export default SvgMusicNotePlus;
