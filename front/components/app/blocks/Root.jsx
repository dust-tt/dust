import Block from "./Block";

export default function Root({
  block,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
  return (
    <Block
      block={block}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    ></Block>
  );
}
