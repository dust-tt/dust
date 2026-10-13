# en-GB style guide

`en-GB` falls back to `en-US` (`CATALOG_FALLBACK_LOCALES` in `front/types/locale.ts`): its catalogs
only translate the messages whose British text differs. Leave every other `msgstr` empty. When a
message contains a spelling listed below but must keep it (see [Unchanged](#unchanged)), set its
`msgstr` to the message itself. Enforced by `en-gb-catalog-holds-only-differences`.

## Spelling

Oxford spelling: `-ize` stays, as in `en-US`, so that the two locales differ as little as possible.

| en-US | en-GB |
|---|---|
| organize, customize, authorization, synchronization, summarize | unchanged |
| analyze, analyzing | analyse, analysing |
| color, favorite, behavior | colour, favourite, behaviour |
| center, meter (unit) | centre, metre |
| canceled, canceling, labeled, unlabeled, totaling, modeling, traveled | cancelled, cancelling, labelled, unlabelled, totalling, modelling, travelled |
| catalog, analog | catalogue, analogue |
| enrollment, fulfill, gray | enrolment, fulfil, grey |
| license (noun) | licence; the verb stays "license" |

`program` stays for software; use `programme` only for a plan or schedule.

## Vocabulary

| en-US | en-GB |
|---|---|
| toward | towards |
| inquiry, inquiries | enquiry, enquiries |
| anymore (in a negative sentence) | any more |

## Unchanged

Keep the `en-US` text for:

- Product, brand and plan names, and code-defined names (skill names, space names, "Help Center"
  when it is a provider's product).
- Labels quoted from a third-party UI, such as a menu path to follow in a provider's console.
- Protocol and API terms shown as field names, such as an OAuth "Authorization URL".
- Wording, punctuation, capitalization and placeholders: only the spelling and the vocabulary above
  change.

Dates, times and numbers are formatted by the locale, never written in a message.
