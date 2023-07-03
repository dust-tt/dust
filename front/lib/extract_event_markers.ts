const EXTRACT_EVENT_PATTERN = /\[\[(.*?)\]\]/; // Ex: [[event]]
type ExtractedMarkersType = { [key: string]: string[] };

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
export function getRawExtractEventMarkersFromText(text: string) {
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
 * @param rawMarkers string[]
 * @returns ExtractedMarkersType
 * @example ["idea", "idea:2", "idea:3", "goals"] returns { "idea": ["idea", "idea:2", "idea:3"], "goals": ["goals"] }
 */
export function sanitizeRawExtractEventMarkers(
  rawMarkers: string[]
): ExtractedMarkersType {
  const markers: { [key: string]: string[] } = {};
  rawMarkers.map((m) => {
    const [key] = m.split(":");
    if (!markers[key]) {
      markers[key] = [];
    }
    markers[key].push(m);
  });
  return markers;
}
