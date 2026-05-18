import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowBlockRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13.604 4.044c.386-.16.831-.071 1.127.225l7 7a1.034 1.034 0 0 1 0 1.463l-7 7A1.035 1.035 0 0 1 12.965 19v-2.965H3.8c-.123 0-.277 0-.412-.01a1.5 1.5 0 0 1-.585-.157 1.54 1.54 0 0 1-.671-.67 1.5 1.5 0 0 1-.156-.586c-.011-.135-.011-.289-.011-.412V9.8c0-.123 0-.277.01-.412.013-.148.043-.362.157-.585l.06-.106c.147-.24.358-.436.61-.565l.166-.07c.161-.058.31-.077.42-.086.135-.011.289-.011.412-.011h9.165V5c0-.418.252-.796.639-.956M15.035 9c0 .572-.463 1.035-1.035 1.035H4.035v3.93H14c.572 0 1.035.463 1.035 1.035v1.502L19.537 12l-4.502-4.502z"
    />
  </svg>
);
export default SvgArrowBlockRight;
