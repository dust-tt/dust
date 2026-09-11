// Creates the two content types behind the customer logo bars ("Trusted by
// 3,000+ organizations") so GTM can reorder / add / retire logos without a
// deploy.
//
// One `logoList` per audience, shared by every bar on every marketing page.
// Publishing a list takes that audience over; every other audience keeps the
// hardcoded lineup, so this rolls out one country at a time.
//
// Run with:
//   npm run contentful:migrate -- --environment-id master
// (see contentful-migrations/README.md for the token setup)
//
// The shapes here must stay in sync with `CustomerLogoFields` /
// `LogoListFields` in lib/contentful/types.ts — the site reads these exact
// field ids.

// Mirrors LOGO_LIST_REGIONS in lib/logo_bars.ts. One entry per audience; the
// list it holds supplies every logo bar on every marketing page for that
// audience. Kept as an `in` validation so editors pick from a dropdown: a
// typo'd region silently detaches the entry and reverts that audience to the
// hardcoded fallback, which is invisible in the editor.
//
// `US` is the catch-all — the United States plus every country not claimed by
// one of the others, which is how the site already routes today.
const REGIONS = ["EU", "FR", "UK", "US"];

module.exports = function (migration) {
  const customerLogo = migration
    .createContentType("customerLogo")
    .name("Customer logo")
    .description(
      "One company logo, reusable across audiences. Unpublish an entry to pull the logo from every list it appears in."
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

  // Field ids mirror the type already built by hand in the Contentful UI
  // (`country`, `customerLogo`), which the site reads by id. Contentful field
  // ids are immutable once created, so this migration exists to reproduce that
  // shape in another environment — not to reshape the live one.
  const logoList = migration
    .createContentType("logoList")
    .name("Logo list")
    .description(
      "The customer logos shown to one audience, in order, across every marketing page. An audience with no published list keeps the lineup hardcoded in the site."
    )
    .displayField("country");

  logoList
    .createField("country")
    .name("Country")
    .type("Symbol")
    .required(true)
    .validations([
      { unique: true },
      {
        in: REGIONS,
        message:
          "For now, only the FR list is set up. To use another list or add another country, contact the eng team :)",
      },
    ]);

  logoList
    .createField("customerLogo")
    .name("Customer logo")
    .type("Array")
    .required(true)
    .items({
      type: "Link",
      linkType: "Entry",
      validations: [{ linkContentType: ["customerLogo"] }],
    });

  logoList.changeFieldControl("country", "builtin", "dropdown", {
    helpText:
      "Who sees this list. FR = France, UK = the United Kingdom, EU = the 27 EU countries (not the UK, Switzerland or Norway), US = the United States and everywhere else. Each audience can only have one list.",
  });
  logoList.changeFieldControl("customerLogo", "builtin", "entryLinksEditor", {
    bulkEditing: false,
    helpText: "Drag to reorder — this is the left-to-right order on the site.",
  });
};
