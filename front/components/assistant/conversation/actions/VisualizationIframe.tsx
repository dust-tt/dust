export default function VisualizationIframe({ code }: { code: string }) {
  return <iframe srcDoc={code}></iframe>;
}
