import { Citation } from "@dust-tt/sparkle";

interface ContentFragmentData {
  title: string;
  content: string;
  file: File;
}

interface InputBarCitationsProps {
  data: ContentFragmentData[];
  onRemoveClick: (idx: number) => void;
}

export function InputBarCitations({
  data,
  onRemoveClick,
}: InputBarCitationsProps) {
  const processContentFragments = () => {
    const nodes: React.ReactNode[] = [];

    for (const [idx, cf] of data.entries()) {
      // TODO(2024-06-25 flav) Render image using base64.
      nodes.push(
        <Citation
          key={`cf-${idx}`}
          title={cf.title}
          size="xs"
          description={cf.content?.substring(0, 100)}
          onClose={() => {
            onRemoveClick(idx);
          }}
        />
      );
    }

    return nodes;
  };

  if (data.length === 0) {
    return;
  }

  return (
    <div className="mr-4 flex gap-2 overflow-auto border-b border-structure-300/50 pb-3 pt-4">
      {processContentFragments()}
    </div>
  );
}
