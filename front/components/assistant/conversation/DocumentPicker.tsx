import {
  Button,
  CloudArrowLeftRightIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  DropdownMenu,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { DataSourceSearchResultType} from "@dust-tt/types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

export function DocumentPicker({
  owner,
  onItemClick,
  pickerButton,
  showFooterButtons = true,
  size = "md",
}: {
  owner: WorkspaceType;
  onItemClick: (document: DataSourceSearchResultType) => void;
  pickerButton?: React.ReactNode;
  showFooterButtons?: boolean;
  size?: "sm" | "md";
}) {
  const MIN_CHARACTERS_TO_SEARCH = 3;
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedDocuments, setSearchedDocuments] = useState<
    DataSourceSearchResultType[]
  >([]);

  useEffect(() => {
    const executeSearch = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/w/${owner.sId}/search?text=${searchText}`
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
  }, [searchText, owner.sId]);

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
                tooltip="Pick an document"
                tooltipPosition="above"
              />
            )}
          </div>
          <DropdownMenu.Items
            origin="auto"
            width={280}
            topBar={
              <>
                <div className="flex flex-grow flex-row border-b border-structure-50 p-2">
                  <Searchbar
                    placeholder="Search"
                    name="input"
                    size="xs"
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
            bottomBar={
              showFooterButtons && (
                <div className="flex border-t border-structure-50 p-2">
                  <Link href={`/w/${owner.sId}/builder/data-sources/managed`}>
                    <Button
                      label="Manage data source"
                      size="xs"
                      variant="primary"
                      icon={CloudArrowLeftRightIcon}
                    />
                  </Link>
                </div>
              )
            }
          >
            {loading ? (
              <Spinner variant="color" size="lg" />
            ) : searchedDocuments.length > 0 ? (
              searchedDocuments.map((d) => (
                <div
                  key={`document-picker-container-${d.documentId}`}
                  className="flex flex-row items-center justify-between pr-2"
                >
                  <DropdownMenu.Item
                    key={`document-picker-${d.documentId}`}
                    label={d.documentTitle}
                    icon={
                      d.connectorProvider
                        ? CONNECTOR_CONFIGURATIONS[d.connectorProvider].logoComponent
                        : DocumentTextIcon
                    }
                    onClick={() => {
                      onItemClick(d);
                      setSearchText("");
                    }}
                  />
                </div>
              ))
            ) : searchText.length < MIN_CHARACTERS_TO_SEARCH ? (
              <div className="text-sm text-element-600">
                Type at least {MIN_CHARACTERS_TO_SEARCH} characters to search in
                your documents titles.
              </div>
            ) : (
              <div className="text-sm text-element-600">
                No titles matches <b>"{searchText}"</b>.
              </div>
            )}
          </DropdownMenu.Items>
        </>
      )}
    </DropdownMenu>
  );
}
