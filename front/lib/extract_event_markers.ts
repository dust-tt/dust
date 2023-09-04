import { Op } from "sequelize";

import { ExtractedEvent } from "@app/lib/models";

const EXTRACT_EVENT_PATTERN = /\[\[(.*?)\]\]/; // Ex: [[event]]

/**
 * Check if a text contains an extract event marker
 * @param text string
 * @returns boolean
 */
export function hasExtractEventMarker(text: string) {
  return EXTRACT_EVENT_PATTERN.test(text);
}

/**
 * Extract the markers from a text
 * @param text
 * @returns an array of markers
 */
export function getRawExtractEventMarkersFromText(text: string): string[] {
  const regex = new RegExp(EXTRACT_EVENT_PATTERN, "g"); // global matching
  const matches = text.match(regex);
  if (matches) {
    return matches.map((match) => match.slice(2, -2).trim());
  } else {
    return [];
  }
}

/**
 * We can use [[idea]] or [[idea:2]] in a document to mark 2 events of the same type.
 * This function will return a dict of markers with the same name.
 * @param markersWithSuffix string[]
 * @returns uniqueMarkersWithoutSuffix string[]
 * @example ["idea", "idea:2", "idea:3", "goals"] returns ["idea",  "goals"]
 */
export function getUniqueMarkersWithoutSuffix(
  markersWithSuffix: string[]
): string[] {
  const uniqueMarkers = new Set<string>();
  markersWithSuffix.forEach((marker) => {
    const [markerWithoutSuffix] = marker.split(":");
    uniqueMarkers.add(markerWithoutSuffix);
  });
  return Array.from(uniqueMarkers);
}

/**
 * Get the markers from the doc and returns only the ones that are not already in the DB
 * @param documentId
 * @param dataSourceName
 * @param documentText
 */
export async function getExtractEventMarkersToProcess({
  documentId,
  dataSourceName,
  documentText,
}: {
  documentId: string;
  dataSourceName: string;
  documentText: string;
}): Promise<string[]> {
  // Gets all markers from the doc content
  const rawMarkers = getRawExtractEventMarkersFromText(documentText);

  // Gets all markers already in the DB for this document
  // Event if an event was rejected, we don't want to re-extract the marker.
  const existingExtractedEvents = await ExtractedEvent.findAll({
    where: {
      documentId: documentId,
      dataSourceName: dataSourceName,
      marker: {
        [Op.in]: rawMarkers,
      },
    },
  });
  const existingExtractedEventMarkers = existingExtractedEvents.map(
    (existingExtractedEvents) => existingExtractedEvents.marker
  );

  // Gets the diff to keep only new markers to process
  return rawMarkers.filter(
    (rawMarker) => !existingExtractedEventMarkers.includes(rawMarker)
  );
}

/**
 * Gets the indexes of the tokens corresponding to the marker.
 * Example, for params:
 * - full_text: Un petit Soupinou des bois [[idea:2]]
 * - strings: ["Un", " petit", " Sou", "pin", "ou", " des", " bois", " [[", "idea", ":", "2", "]]"];
 * - marker: "[[idea:2]]"
 * Will return { start: 7, end: 11 }
 */
export function findMarkersIndexes({
  fullText,
  marker,
  strings,
}: {
  fullText: string;
  marker: string;
  strings: string[];
}): { start: number; end: number } {
  const markerIndex = fullText.indexOf(marker);
  if (markerIndex === -1) return { start: -1, end: -1 };

  let charCount = 0;
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < strings.length; i++) {
    const str = strings[i];
    charCount += str.length;

    if (startIndex === -1 && charCount > markerIndex) {
      startIndex = i;
    }

    if (charCount >= markerIndex + marker.length) {
      endIndex = i;
      break;
    }
  }

  return { start: startIndex, end: endIndex };
}
