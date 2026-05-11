import type { SVGProps } from "react";
import * as React from "react";

const SvgLineHeight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 19.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07zM11.321 5.83a1.54 1.54 0 0 1 1.194-.07l.164.07.133.076c.291.19.453.456.536.602.106.187.216.43.323.665l4.271 9.397a1.036 1.036 0 0 1-1.884.858l-1.542-3.394H9.484L7.942 17.43a1.036 1.036 0 0 1-1.884-.858l4.271-9.397c.107-.236.217-.478.323-.665.095-.166.292-.492.67-.678m-.895 6.134h3.148L12 8.5zM21 1.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
    />
  </svg>
);
export default SvgLineHeight;
