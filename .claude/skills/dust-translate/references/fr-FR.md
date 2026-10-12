# fr-FR style guide

## Voice

- Address the user with *vous* (deuxième personne du pluriel de politesse), never *tu*.
  Exception: prompts the user sends to an agent (prompt starters, prefilled composer text,
  Discover suggestions) are written as the user speaking to the agent and use *tu* (deuxième
  personne du singulier): "Utilise…", "Aide-moi à…", "Résume-moi…". Never "Utilisez…" in those
  prompts. Enforced by `fr-address-form-by-audience` in `front/CONTRACTS`.
- Buttons and menu items use the infinitive: "Enregistrer", "Annuler", "Rejoindre".
- Toasts and errors are full sentences ending with a period: "Impossible d'enregistrer la langue.",
  "Le nom est obligatoire."
- Never "Veuillez": use the imperative. "Réessayez.", "Contactez le support.", "Saisissez un nom."
- Confirmation dialog titles are questions with the infinitive, not nouns: "Archiver la
  compétence ?", "Supprimer {spaceName} ?". Never "Archivage de…" or "Suppression de…".

## Plurals

- Write the `one` and `other` branches only. `one` covers 0 and 1 in French. CLDR `many` only
  applies to numbers such as 1 000 000 and falls back to `other`, so do not add it; an existing
  `many` branch must match `other`.
- When the English count is 1 and a demonstrative reads better, the `one` branch may drop `#`:
  `one {Voulez-vous vraiment supprimer cette conversation ?}`, but only when 0 cannot reach it.

## Typography

- Non-breaking space (U+00A0) before `:` and narrow non-breaking space (U+202F) before `?`, `!`
  and `;`. No space before `.` or `,`.
- Quotation marks: « texte » with non-breaking spaces inside.
- Apostrophe: typographic `’` (U+2019).
- Sentence case: only the first word and proper nouns take a capital. No title case. Use "et",
  not "&": "Agents et compétences".
- Numbers and percentages go through the locale formatter: "2 000", "20 %", "4,1 s". Never
  `{value}%` or an unformatted number in a placeholder.
- Accents on capitals: "État", "À propos".

## Glossary

| English | fr-FR | Note |
|---|---|---|
| Dust | Dust | Never translated |
| agent | agent | |
| workspace | workspace | Never translated, masculine: « le workspace », « ce workspace ». Never « espace de travail » |
| space | espace | |
| Pod | Pod | Product name, capitalised |
| skill | compétence | |
| Frame | Frame | Product name |
| Pro, Enterprise, … (plan names) | Pro, Enterprise, … | Never translated: « S’abonner à Pro » |
| plan | forfait | Generic noun only, plan names stay as is |
| memory (user memory) | mémoire | |
| wake-up | réveil | An agent’s scheduled return to a conversation: « Réveils », « Impossible de charger vos réveils. » |
| conversation | conversation | |
| mention | mention | |
| admin | administrateur | |
| member | membre | |
| user (a person of the workspace) | membre | « Membres actifs », « Rechercher des membres… ». Keep « utilisateur » for pricing units (« Jusqu’à 100 utilisateurs », « par utilisateur ») and identity provisioning |
| seat | siège | Never « licence » or « place ». « siège gratuit », « type de siège » |
| invalid | non valide | Never « invalide »: « URL non valide », « Nom non valide » |
| approval (tool approval) | approbation | « Approbation 1 sur 3 ». « validation » only for a validation e-mail |
| subscribe | s’abonner | « S’abonner à un forfait payant ». Never « souscrire un forfait » |
| Computer (sandbox) | Computer | Product name, capitalised, masculine: « le Computer », « chaque Computer », « Computers actifs » |
| Discover Skills (and other code-defined skill names) | Discover Skills | System skill names are code-defined and never translated |
| inbox | boîte de réception | |
| Slack | Slack | Brand |
| email | e-mail | |
| settings | paramètres | |
| sign in | se connecter | |
| scope (OAuth, API key) | périmètre | Never « portée » |
| client ID, client secret | ID client, secret client | Keep the provider’s English label only inside quoted UI paths |
| favorite, starred | favori | Never « étoile », even for starred items |
| programmatic usage | utilisation via l’API | Never "programmatique": reword around "via l’API" |
| programmatic credits | crédits API | |
| programmatic API | API | "programmatic" adds nothing in French |
| permission | autorisation | Never « permission ». Keep the provider’s English label inside quoted UI paths |
| manager (workspace or group role) | manager | « responsable » only for a task assignee or an account manager |
| Agent Builder | éditeur d’agent | « l’éditeur d’agent ». Never « Agent Builder » |
| fair use | usage raisonnable | « politique d’usage raisonnable » |
| label (document or sensitivity label) | étiquette | Except « Libellé du tag » |
| Dust app | app Dust | Plural « apps Dust ». Never « Dust app » or « application Dust » |
| upload (noun) | import | « Import en cours… » |
| type, enter (in a field) | saisir | « Saisissez… ». « Tapez » only for a keystroke: « Tapez / » |
| Analytics | Statistiques | |
| Insights | Analyses | |
| Company Data | Company Data | Space name, never translated |
| emoji | émoji | |
| credit usage | consommation de crédits | |
| reasoning effort | niveau d’effort | As in Claude. Plural « niveaux d’effort ». Never « effort de raisonnement » or « niveau de raisonnement » |
| spend-limit upgrade request | demande d’augmentation | Plan or seat upgrades stay « mise à niveau » or « passer à un forfait supérieur » |
| job function (onboarding) | French name when one is established | « Données », « Informatique ». Keep « Customer Success » and « Revenue Operations » |
| job title (profile field) | fonction | The options are job functions, not titles. Never « Intitulé de poste » |
| pronoun presets (She/Her, He/Him, They/Them) | Elle/Elle, Il/Lui, Iel/Iel | Saved to the profile as is: do not change |
| last week / last month (rolling window) | 7 derniers jours / 30 derniers jours | « La semaine dernière » means the previous calendar week |
