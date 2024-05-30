import {
  Button,
  DocumentPlusIcon,
  DropdownMenu,
  Markdown,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import { ContextItem } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { DataSourceSearchResultType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

export function DocumentPicker({
  owner,
  onItemClick,
  pickerButton,
  size = "md",
}: {
  owner: WorkspaceType;
  onItemClick: (document: DataSourceSearchResultType) => void;
  pickerButton?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const MIN_CHARACTERS_TO_SEARCH = 3;
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedDocuments, setSearchedDocuments] = useState<
    DataSourceSearchResultType[]
  >([]);
  const [clickedDocuments, setClickedDocuments] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      const executeSearch = async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/w/${owner.sId}/data_sources/search?query=${encodeURIComponent(
              searchText
            )}`
          );
          if (res.ok) {
            const documents: DataSourceSearchResultType[] = (await res.json())
              .documents;
            setSearchedDocuments(documents);
          }
        } catch (error) {
          console.error("Error fetching documents:", error);
        } finally {
          setLoading(false);
        }
      };

      if (searchText.length >= MIN_CHARACTERS_TO_SEARCH) {
        void executeSearch();
      } else if (searchText.length === 0) {
        setSearchedDocuments([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchText, owner.sId]);

  const handleAddClick = (document: DataSourceSearchResultType) => {
    setClickedDocuments((prev) => new Set(prev).add(document.documentId));
    onItemClick(document);
  };

  return (
    <DropdownMenu>
      {() => (
        <>
          <div onClick={() => setSearchText("")} className="flex">
            {pickerButton ? (
              <DropdownMenu.Button size={size}>
                {pickerButton}
              </DropdownMenu.Button>
            ) : (
              <DropdownMenu.Button
                icon={DocumentPlusIcon}
                size={size}
                tooltip="Pick a document"
                tooltipPosition="above"
              />
            )}
          </div>
          <DropdownMenu.Items
            onKeyDown={(e) => {
              if (e.key === " ") {
                setSearchText((prev) => prev + " ");
                e.preventDefault();
              }
            }}
            origin="auto"
            width={700} // Adjust width as needed
            topBar={
              <>
                <div className="flex flex-grow flex-row border-b border-structure-50 p-3">
                  <Searchbar
                    placeholder="Search"
                    name="input"
                    size="sm" // Increase search bar size
                    value={searchText}
                    onChange={setSearchText}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchedDocuments.length > 0) {
                        onItemClick(searchedDocuments[0]);
                        setSearchText("");
                      }
                    }}
                  />
                </div>
              </>
            }
          >
            {loading ? (
              <Spinner variant="color" size="lg" />
            ) : searchedDocuments.length > 0 ? (
              <ContextItem.List>
                {searchedDocuments.map((d) => (
                  <ContextItem
                    key={`document-picker-${d.documentId}`}
                    title={
                      d.documentTitle.length > 60
                        ? `${d.documentTitle.slice(0, 60)} ...`
                        : d.documentTitle
                    }
                    visual={
                      d.connectorProvider ? (
                        <ContextItem.Visual
                          visual={
                            CONNECTOR_CONFIGURATIONS[d.connectorProvider]
                              .logoComponent
                          }
                        />
                      ) : (
                        <></>
                      )
                    }
                    action={
                      <div className="flex w-full justify-center">
                        <Button
                          label="Add"
                          className="rounded bg-blue-500 px-2 py-1 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent the dropdown from closing
                            handleAddClick(d);
                          }}
                          disabled={clickedDocuments.has(d.documentId)}
                        />
                      </div>
                    }
                  >
                    <ContextItem.Description>
                      <div className="document-picker-markdown">
                        <Markdown content={d.highlightedText} />
                      </div>
                      {/*<div dangerouslySetInnerHTML={{ __html: d.highlightedText}}></div>*/}
                    </ContextItem.Description>
                  </ContextItem>
                ))}
              </ContextItem.List>
            ) : searchText.length < MIN_CHARACTERS_TO_SEARCH ? (
              <div className="text-sm text-element-600">
                Type at least {MIN_CHARACTERS_TO_SEARCH} characters to search in
                your documents titles.
              </div>
            ) : (
              <div className="text-sm text-element-600">
                No titles match <b>"{searchText}"</b>.
              </div>
            )}
          </DropdownMenu.Items>
        </>
      )}
    </DropdownMenu>
  );
}
