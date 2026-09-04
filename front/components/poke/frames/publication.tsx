import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameDetails } from "@app/lib/api/poke/frames";
import { CodeBlock, File02, Folder, Tree } from "@dust-tt/sparkle";

interface FramePublicationSectionProps {
  publication: PokeFrameDetails["publication"];
  publicationError: string | null;
}

export function FramePublicationSection({
  publication,
  publicationError,
}: FramePublicationSectionProps) {
  return (
    <div className="my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Active publication</h2>
      {publicationError ? (
        <div className="text-sm text-warning">
          Could not load the publication descriptor: {publicationError}
        </div>
      ) : !publication ? (
        <div className="text-sm text-muted-foreground">
          This Frame has never been published.
        </div>
      ) : (
        <>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableHead>Publication ID</PokeTableHead>
                <PokeTableCell>{publication.publicationId}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Published at</PokeTableHead>
                <PokeTableCell>{publication.publishedAt}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Publisher</PokeTableHead>
                <PokeTableCell>{publication.publisher ?? "—"}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>UI bundle sha256</PokeTableHead>
                <PokeTableCell className="font-mono text-xs">
                  {publication.uiBundleSha256}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>

          <h3 className="pt-6 pb-2 font-medium">
            Source files ({publication.sourceFiles.length})
          </h3>
          <Tree isBoxed>
            {renderSourceFileTree(
              buildSourceFileTree(
                publication.sourceFiles.map((sourceFile) => sourceFile.path)
              )
            )}
          </Tree>

          {publication.databases.length > 0 && (
            <>
              <h3 className="pt-6 pb-2 font-medium">
                Declared databases ({publication.databases.length})
              </h3>
              {publication.databases.map((database) => (
                <div key={database.name} className="pb-4">
                  <div className="pb-1 text-sm font-medium">
                    {database.name}
                  </div>
                  {/*
                    CodeBlock's `className` is only used to derive the syntax-highlighting
                    language (via a `language-(\w+)` regex match); the wrapper div and the
                    SyntaxHighlighter it renders both use hardcoded classNames, so a height
                    clamp passed to CodeBlock itself is silently discarded. Apply the clamp on
                    an outer wrapper instead so it actually takes effect.
                  */}
                  <div className="max-h-64 overflow-auto">
                    <CodeBlock wrapLongLines className="language-ts">
                      {database.schemaSource}
                    </CodeBlock>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface SourceFileTreeNode {
  name: string;
  path: string;
  children: SourceFileTreeNode[];
}

function buildSourceFileTree(paths: string[]): SourceFileTreeNode[] {
  const root: SourceFileTreeNode = { name: "", path: "", children: [] };
  const nodesByPath = new Map<string, SourceFileTreeNode>([["", root]]);

  for (const path of paths) {
    let parent = root;
    let currentPath = "";
    for (const segment of path.split("/")) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let node = nodesByPath.get(currentPath);
      if (!node) {
        node = { name: segment, path: currentPath, children: [] };
        nodesByPath.set(currentPath, node);
        parent.children.push(node);
      }
      parent = node;
    }
  }

  return sortSourceFileTree(root.children);
}

// Directories first, then files, each alphabetically.
function sortSourceFileTree(nodes: SourceFileTreeNode[]): SourceFileTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      const aIsDir = a.children.length > 0;
      const bIsDir = b.children.length > 0;
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({ ...node, children: sortSourceFileTree(node.children) }));
}

function renderSourceFileTree(nodes: SourceFileTreeNode[]): React.ReactNode {
  return nodes.map((node) =>
    node.children.length > 0 ? (
      <Tree.Item key={node.path} label={node.name} visual={Folder} type="node">
        {renderSourceFileTree(node.children)}
      </Tree.Item>
    ) : (
      <Tree.Item
        key={node.path}
        label={node.name}
        visual={File02}
        type="leaf"
      />
    )
  );
}
