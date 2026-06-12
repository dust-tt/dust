// Demo workbooks, imported straight from the committed corpus so the app
// exercises the exact files the engine's golden tests pin. `?url` turns each
// into a hashed static asset the worker streams back in over fetch.

import customNumfmtsUrl from "../../../corpus/gen/custom_numfmts.xlsx?url";
import generatedMediumCsvUrl from "../../../corpus/gen/csv/generated_medium.csv?url";
import hyperlinksUrl from "../../../corpus/gen/hyperlinks.xlsx?url";
import mergesFrozenUrl from "../../../corpus/gen/merges_frozen.xlsx?url";
import mixedLargeUrl from "../../../corpus/gen/mixed_large.xlsx?url";
import multiSheet50Url from "../../../corpus/gen/multi_sheet_50.xlsx?url";
import stringsUnicodeUrl from "../../../corpus/gen/strings_unicode.xlsx?url";
import tallNarrowUrl from "../../../corpus/gen/tall_narrow.xlsx?url";
import wideShortUrl from "../../../corpus/gen/wide_short.xlsx?url";

import encryptedUrl from "../../../corpus/evil/encrypted.xlsx?url";
import fakeOdsUrl from "../../../corpus/evil/fake_ods.xlsx?url";
import garbageUrl from "../../../corpus/evil/garbage.xlsx?url";
import xssHyperlinksUrl from "../../../corpus/evil/xss_hyperlinks.xlsx?url";
import zipBombUrl from "../../../corpus/evil/zip_bomb_total.xlsx?url";

export interface Sample {
  fileName: string;
  url: string;
  description: string;
}

export const SAMPLES: Sample[] = [
  {
    fileName: "mixed_large.xlsx",
    url: mixedLargeUrl,
    description: "30k mixed cells, currency/percent/date formats",
  },
  {
    fileName: "tall_narrow.xlsx",
    url: tallNarrowUrl,
    description: "50,000 rows, scroll me",
  },
  {
    fileName: "wide_short.xlsx",
    url: wideShortUrl,
    description: "2,000 columns",
  },
  {
    fileName: "multi_sheet_50.xlsx",
    url: multiSheet50Url,
    description: "50 sheets, lazily parsed on tab switch",
  },
  {
    fileName: "merges_frozen.xlsx",
    url: mergesFrozenUrl,
    description: "Merges, frozen panes, hidden rows/cols",
  },
  {
    fileName: "custom_numfmts.xlsx",
    url: customNumfmtsUrl,
    description: "Custom number formats (ECMA-376)",
  },
  {
    fileName: "strings_unicode.xlsx",
    url: stringsUnicodeUrl,
    description: "Unicode, emoji, RTL strings",
  },
  {
    fileName: "hyperlinks.xlsx",
    url: hyperlinksUrl,
    description: "Hyperlinks across two sheets",
  },
  {
    fileName: "generated_medium.csv",
    url: generatedMediumCsvUrl,
    description: "CSV through the same engine path",
  },
];

/** Files built to break parsers; the engine answers each with a typed error
 * (or opens it defanged) instead of crashing, hanging, or OOMing. */
export const HOSTILE_SAMPLES: Sample[] = [
  {
    fileName: "xss_hyperlinks.xlsx",
    url: xssHyperlinksUrl,
    description: "javascript: links, opens with them stripped",
  },
  {
    fileName: "zip_bomb_total.xlsx",
    url: zipBombUrl,
    description: "96 MB decompression bomb; later sheets hit the budget and stay unloaded",
  },
  {
    fileName: "encrypted.xlsx",
    url: encryptedUrl,
    description: "Password-protected workbook",
  },
  {
    fileName: "garbage.xlsx",
    url: garbageUrl,
    description: "Random bytes with an .xlsx name",
  },
  {
    fileName: "fake_ods.xlsx",
    url: fakeOdsUrl,
    description: "OpenDocument disguised as .xlsx",
  },
];
