import dynamic from "next/dynamic";

const CodeEditor = dynamic(() => import("/public/static/mycomp.tsx"), {
  ssr: true,
});

export default function Iframe() {
  return <CodeEditor />;
}
