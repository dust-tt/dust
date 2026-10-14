import type { SVGProps } from "react";
import * as React from "react";

const SvgIm = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#D80027"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#F0F0F0"
      d="m13.702 6.704-.706 2.522-2.121-.392L9.51 6.02 5.822 7.33l-.29-.82-.966-.12.727 2.05 2.538-.65.721 2.033-1.754 2.589 2.977 2.54-.564.66.38.896L11 14.854l-1.83-1.873 1.399-1.641 3.12.225.71-3.848.855.157.585-.776z"
    />
  </svg>
);
export default SvgIm;
