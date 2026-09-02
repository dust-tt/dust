import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameDetails } from "@app/lib/api/poke/frames";
import { CodeBlock } from "@dust-tt/sparkle";

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
          <PokeTable>
            <PokeTableBody>
              {publication.sourceFiles.map((sourceFile) => (
                <PokeTableRow key={sourceFile.path}>
                  <PokeTableHead>{sourceFile.path}</PokeTableHead>
                  <PokeTableCell className="font-mono text-xs">
                    {sourceFile.contentSha256}
                  </PokeTableCell>
                </PokeTableRow>
              ))}
            </PokeTableBody>
          </PokeTable>

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
