# de-DE style guide

## Voice

- Address the user with *Sie* (formal), never *du*. *Sie*, *Ihr*, *Ihnen* are always capitalised.
  Exception: prompts the user sends to an agent (prompt starters, prefilled composer text,
  Discover suggestions) are written as the user speaking to the agent and use *du*: "Hilf mir…",
  "Fasse … zusammen", "Erstelle…". Never "Helfen Sie mir…" in those prompts. Enforced by
  `de-address-form-by-audience` in `front/CONTRACTS`.
- Buttons and menu items use the infinitive: "Speichern", "Abbrechen", "Beitreten".
- Toasts and errors are full sentences ending with a period: "Die Sprache konnte nicht gespeichert
  werden.", "Der Name ist erforderlich."
- Avoid "Bitte": use the imperative. "Versuchen Sie es erneut.", "Wenden Sie sich an den Support.",
  "Geben Sie einen Namen ein."
- Confirmation dialog titles are questions with the infinitive, not nouns: "Fähigkeit
  archivieren?", "{spaceName} löschen?". Never "Archivierung von…" or "Löschung von…".

## Plurals

- Write the `one` and `other` branches only. `one` covers 1 only in German: 0 uses `other`
  ("0 Agenten").
- When the English count is 1 and a demonstrative reads better, the `one` branch may drop `#`:
  `one {Möchten Sie diese Unterhaltung wirklich löschen?}`.

## Typography

- Quotation marks: „Text“ (U+201E and U+201C), no spaces inside.
- No space before `:`, `?`, `!` or `;`.
- Apostrophe: typographic `’` (U+2019), only where German needs one.
- Sentence case: nouns take a capital as German grammar requires, nothing else. No title case. Use
  "und", not "&": "Agenten und Fähigkeiten".
- Compounds with an English or product term take a hyphen: "Dust-App", "Slack-Verbindung",
  "Agent-Editor", "API-Schlüssel".
- Numbers and percentages go through the locale formatter: "2.000", "20 %", "4,1 s". Never
  `{value}%` or an unformatted number in a placeholder.
- Keep labels short: German runs longer than English. Prefer the shorter compound or reword
  ("Speichern" over "Änderungen speichern" when the context is clear).

## Glossary

| English | de-DE | Note |
|---|---|---|
| Dust | Dust | Never translated |
| agent | Agent | Masculine: „der Agent“, plural „Agenten“ |
| workspace | Workspace | Never translated, masculine: „der Workspace“, „dieser Workspace“. Never „Arbeitsbereich“ |
| space | Bereich | |
| Pod | Pod | Product name, capitalised, masculine: „der Pod“ |
| skill | Fähigkeit | Plural „Fähigkeiten“ |
| Frame | Frame | Product name, neuter: „das Frame“ |
| Pro, Enterprise, … (plan names) | Pro, Enterprise, … | Never translated: „Pro abonnieren“ |
| plan | Tarif | Generic noun only, plan names stay as is |
| memory (user memory) | Gedächtnis | |
| wake-up | Weckruf | An agent’s scheduled return to a conversation: „Weckrufe“, „Ihre Weckrufe konnten nicht geladen werden.“ |
| conversation | Unterhaltung | Never „Konversation“ |
| mention | Erwähnung | |
| admin | Administrator | |
| member | Mitglied | |
| user (a person of the workspace) | Mitglied | „Aktive Mitglieder“, „Mitglieder suchen…“. Keep „Nutzer“ for pricing units („Bis zu 100 Nutzer“, „pro Nutzer“) and identity provisioning |
| seat | Platz | Never „Lizenz“ or „Sitz“. „kostenloser Platz“, „Platztyp“ |
| invalid | ungültig | „Ungültige URL“, „Ungültiger Name“ |
| approval (tool approval) | Genehmigung | „Genehmigung 1 von 3“. „Bestätigung“ only for a confirmation e-mail |
| subscribe | abonnieren | „Einen kostenpflichtigen Tarif abonnieren“ |
| Computer (sandbox) | Computer | Product name, capitalised, masculine: „der Computer“, „jeder Computer“, „Aktive Computer“ |
| Discover Skills (and other code-defined skill names) | Discover Skills | System skill names are code-defined and never translated |
| inbox | Posteingang | |
| Slack | Slack | Brand |
| email | E-Mail | |
| settings | Einstellungen | |
| sign in | anmelden | |
| scope (OAuth, API key) | Berechtigungsumfang | Never „Scope“ or „Bereich“ |
| client ID, client secret | Client-ID, Client-Secret | Keep the provider’s English label only inside quoted UI paths |
| favorite, starred | Favorit | Never „Stern“, even for starred items |
| programmatic usage | Nutzung über die API | Never „programmatisch“: reword around „über die API“ |
| programmatic credits | API-Credits | |
| credit | Credit | Plural „Credits“. Never „Guthaben“ |
| programmatic API | API | „programmatic“ adds nothing in German |
| permission | Berechtigung | Keep the provider’s English label inside quoted UI paths |
| manager (workspace or group role) | Manager | „Verantwortlicher“ only for a task assignee or an account manager |
| Agent Builder | Agent-Editor | „der Agent-Editor“. Never „Agent Builder“ |
| fair use | angemessene Nutzung | „Richtlinie zur angemessenen Nutzung“ |
| label (document or sensitivity label) | Label | Except „Tag-Name“ |
| Dust app | Dust-App | Plural „Dust-Apps“. Never „Dust app“ or „Dust-Anwendung“ |
| upload (noun) | Upload | „Upload läuft…“ |
| type, enter (in a field) | eingeben | „Geben Sie … ein“. „Tippen“ only for a keystroke: „Tippen Sie /“ |
| Analytics | Statistiken | |
| Insights | Analysen | |
| Company Data | Company Data | Space name, never translated |
| emoji | Emoji | |
| credit usage | Credit-Verbrauch | |
| reasoning effort | Aufwandsstufe | Plural „Aufwandsstufen“. Never „Denkaufwand“ or „Reasoning-Aufwand“ |
| spend-limit upgrade request | Erhöhungsanfrage | Plan or seat upgrades stay „Upgrade“ or „auf einen höheren Tarif wechseln“ |
| job function (onboarding) | German name when one is established | „Daten“, „IT“. Keep „Customer Success“ and „Revenue Operations“ |
| job title (profile field) | Funktion | The options are job functions, not titles. Never „Berufsbezeichnung“ |
| pronoun presets (She/Her, He/Him, They/Them) | Sie/Ihr, Er/Ihm, They/Them | Saved to the profile as is: do not change |
| last week / last month (rolling window) | Letzte 7 Tage / Letzte 30 Tage | „Letzte Woche“ means the previous calendar week |
| tool | Tool | Plural „Tools“ |
| trigger | Trigger | |
| schedule | Zeitplan | |
| connection | Verbindung | |
| knowledge | Wissen | |
| data source | Datenquelle | |
| folder | Ordner | |
| tag | Tag | Neuter: „das Tag“, plural „Tags“ |
| editor (person who can edit an agent, skill or Pod) | Bearbeiter | Never „Editor“, which would clash with „Agent-Editor“ |
| capabilities (agent builder) | Funktionen | „Fähigkeit“ is reserved for skill |
| credentials | Anmeldedaten | Never „Zugangsdaten“ |
| allowlist | Zulassungsliste | |
| rate limit | Ratenlimit | |
| task | Aufgabe | |
| assignee | Verantwortlicher | |
| branch (a conversation) | verzweigen | „Unterhaltung verzweigen“, „Verzweigt von „…““ |
| compact, compaction | komprimieren, Komprimierung | |
| default agent | Standard-Agent | |
| model tier | Modellstufe | |
| spend limit | Ausgabenlimit | |
| cap (credits, spend) | Obergrenze | |
| credit pool | Credit-Pool | |
| top-up | Aufladung | |
| billing period | Abrechnungszeitraum | |
| coupon | Gutschein | |
| self-improving skills | selbstverbessernde Fähigkeiten | |
| automation | Automatisierung | |
| Workspace (genitive) | des Workspace | Never „des Workspaces“ |
