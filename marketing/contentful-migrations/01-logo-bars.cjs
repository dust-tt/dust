// Creates the two content types behind the customer logo bars ("Trusted by
// 3,000+ organizations") so GTM can reorder / add / retire logos without a
// deploy.
//
// Run with:
//   npm run contentful:migrate -- --environment-id master
// (see contentful-migrations/README.md for the token setup)
//
// The shapes here must stay in sync with `CustomerLogoFields` / `LogoBarFields`
// in lib/contentful/types.ts — the site reads these exact field ids.

// Mirrors LOGO_BAR_SLUGS in lib/logo_bars.ts: `trusted-by-<set>-<region>` for
// every set/region pair, plus the three home hero variants. Kept as an `in`
// validation so editors pick from a dropdown instead of typing: a typo'd slug
// silently detaches the entry and reverts that bar to its hardcoded fallback.
const TRUSTED_BY_LOGO_SETS = [
  "default",
  "landing",
  "b2b-saas",
  "marketplace",
  "finance",
  "insurance",
  "retail",
];
const TRUSTED_BY_REGIONS = ["us", "eu"];
const HOME_TRUSTED_GEOS = ["default", "gb", "fr"];

const BAR_SLUGS = [
  ...TRUSTED_BY_LOGO_SETS.flatMap((set) =>
    TRUSTED_BY_REGIONS.map((region) => `trusted-by-${set}-${region}`)
  ),
  ...HOME_TRUSTED_GEOS.map((geo) => `home-trusted-${geo}`),
];

module.exports = function (migration) {
  const customerLogo = migration
    .createContentType("customerLogo")
    .name("Customer logo")
    .description(
      "One company logo, reusable across logo bars. Unpublish an entry to pull the logo from every bar it appears in."
    )
    .displayField("companyName");

  customerLogo
    .createField("companyName")
    .name("Company name")
    .type("Symbol")
    .required(true);

  customerLogo
    .createField("logo")
    .name("Logo")
    .type("Link")
    .linkType("Asset")
    .required(true)
    .validations([{ linkMimetypeGroup: ["image"] }]);

  customerLogo
    .createField("caseStudy")
    .name("Case study")
    .type("Link")
    .linkType("Entry")
    .required(false)
    .validations([{ linkContentType: ["customerStory"] }]);

  customerLogo
    .createField("caseStudyUrl")
    .name("Case study URL (fallback)")
    .type("Symbol")
    .required(false)
    .validations([
      {
        regexp: { pattern: "^(/|https?://)", flags: null },
        message:
          "Must start with / (e.g. /customers/acme) or with http:// or https://",
      },
    ]);

  customerLogo.changeFieldControl("companyName", "builtin", "singleLine");
  customerLogo.changeFieldControl("logo", "builtin", "assetLinkEditor", {
    helpText:
      "SVG preferred. The site normalises the logo to gray, so upload the original brand colours.",
  });
  customerLogo.changeFieldControl("caseStudy", "builtin", "entryLinkEditor", {
    helpText:
      "Preferred way to link a case study — the URL follows the story's slug, so it can't drift.",
  });
  customerLogo.changeFieldControl("caseStudyUrl", "builtin", "singleLine", {
    helpText:
      "Only for logos whose story isn't a Customer story entry yet. Ignored when Case study is set.",
  });

  const logoBar = migration
    .createContentType("logoBar")
    .name("Logo bar")
    .description(
      "One 'Trusted by' bar. The logos below are shown in this order; a bar with no published entry falls back to the list hardcoded in the site."
    )
    .displayField("name");

  logoBar
    .createField("name")
    .name("Name")
    .type("Symbol")
    .required(true);

  logoBar
    .createField("barSlug")
    .name("Bar slug")
    .type("Symbol")
    .required(true)
    .validations([{ unique: true }, { in: BAR_SLUGS }]);

  logoBar
    .createField("logos")
    .name("Logos")
    .type("Array")
    .required(true)
    .items({
      type: "Link",
      linkType: "Entry",
      validations: [{ linkContentType: ["customerLogo"] }],
    })
    .validations([{ size: { min: 1 } }]);

  logoBar.changeFieldControl("name", "builtin", "singleLine", {
    helpText: "Internal label only — never shown on the site.",
  });
  logoBar.changeFieldControl("barSlug", "builtin", "dropdown", {
    helpText:
      "Which bar on the site this fills. Each slug can only be used once.",
  });
  logoBar.changeFieldControl("logos", "builtin", "entryLinksEditor", {
    bulkEditing: false,
    helpText: "Drag to reorder — this is the left-to-right order on the site.",
  });
};
