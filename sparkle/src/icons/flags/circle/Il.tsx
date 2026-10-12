import type { SVGProps } from "react";
import * as React from "react";

const SvgIl = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#0052B4"
      d="M13.765 7.826h-2.51L10 5.652 8.745 7.826h-2.51L7.49 10l-1.256 2.174h2.51L10 14.348l1.255-2.174h2.51L12.51 10zM11.542 10l-.771 1.335H9.229L8.458 10l.77-1.335h1.543zM10 7.329l.287.497h-.574zM7.687 8.665h.574l-.287.497zm0 2.67.287-.497.287.498zM10 12.672l-.287-.497h.574zm2.313-1.335h-.574l.287-.498zm-.574-2.671h.574l-.287.497zM16.224 2.174H3.774a10 10 0 0 0-2.307 2.609H18.53a10 10 0 0 0-2.307-2.61M3.774 17.826h12.45a10 10 0 0 0 2.307-2.609H1.467a10 10 0 0 0 2.307 2.61"
    />
  </svg>
);
export default SvgIl;
