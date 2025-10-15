import type { ReactElement } from "react";

import {
  A,
  Grid,
  H1,
  H2,
  H3,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.cube),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function PlatformPrivacy() {
  return (
    <>
      <div className="container flex w-full flex-col gap-16 px-6 md:gap-24">
        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-6 pt-24",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H3 className="text-muted-foreground">Privacy & Compliance</H3>
            <H1
              mono
              className="text-5xl font-medium leading-tight md:text-6xl lg:text-7xl"
            >
              Platform Privacy Policy
            </H1>
            <P size="lg" className="text-muted-foreground">
              At Dust, we are committed to maintaining the confidentiality and
              security of any personal information about our users. Your privacy
              is always at the top of our priorities.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <P size="md">
              This Privacy Policy explains who we are and spells out how we
              collect, use, and disclose information that relates to you, as
              defined under applicable data protection laws ("Personal Data")
              and how to exercise your privacy rights. If you have any questions
              or concerns about our use of your Personal Data, please contact us
              using the details provided in Section 13 below.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>About Us</H2>
            <P size="md">
              Permutation Labs, 86 avenue de Wagram, 75017 Paris, France ("
              <Strong>Dust</Strong>", "<Strong>we</Strong>", "
              <Strong>our</Strong>", or "<Strong>us</Strong>"), develops and
              provides a platform to build LLM apps and AI assistants with
              access to your company's knowledge that allows you to get more
              done, faster, leveraging composable tools to retrieve and share
              internal information effectively.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>1. About this Privacy Policy</H2>
            <P size="md">
              This Privacy Policy applies to you when you access or use the Dust
              platform, that is to say, our online software-as-service platform,
              including any related APIs provided by Dust, together with all
              related applications ("Platform"), participate in our user
              research activities or otherwise interact or communicate with us.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>2. Who is responsible for processing your personal data?</H2>
            <P size="md">
              This Privacy Policy only applies where we are processing your
              Personal Data for our own purposes and are acting as Data
              Controller under the General Data Protection Regulation (UE)
              2016/679 ("GDPR").
            </P>
            <P size="md">
              It does not cover the Personal Data Dust collects, uses, and
              discloses when acting as a Data Processor under the GDPR on behalf
              of its Customers ("Customer Personal Data") and under their
              instructions in connection with Dust Platform. We invite you to
              contact your company or organization if you have any questions
              about its privacy practices.
            </P>
            <P size="md">
              As Data Controller, Dust will process Customer Personal Data to
              provide the Platform and for other limited purposes as outlined in
              Section 6 below.
            </P>
            <P size="md">
              Where Dust is the Data Controller, if you have any questions about
              this Platform Privacy Policy or about our data protection
              practices, you can contact us. See how to contact us in Section 13
              below.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>3. The Personal Data we collect</H2>
            <P size="md">
              Dust collects and processes your Personal Data when you use the
              Platform. This includes:
            </P>

            <div className="flex flex-col gap-6 pt-4">
              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">Identification and Contact Data</H3>
                <P size="sm" className="mb-2">
                  First and last name, email address, and telephone number
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you order and use our Platform,
                  or contact us or otherwise interact with us; From third
                  parties and publicly available sources
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Delivering the Platform; Marketing
                  Communications (as defined below); Leads qualification;
                  Organizing, managing, and facilitating access to our events
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">
                  Professional or Employment-Related Data
                </H3>
                <P size="sm" className="mb-2">
                  Job position, job title, workplace, and industry
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you order and use our Platform,
                  contact us, or otherwise interact with us; From third parties
                  and publicly available sources
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Marketing Communications; Leads
                  qualification; Organizing, managing, and facilitating access
                  to our events
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">
                  Any other Personal Data you voluntarily choose to provide
                </H3>
                <P size="sm" className="mb-2">
                  Personal Data in request or feedback you send us
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you order and use our Platform,
                  contact us or otherwise interact with us
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Fulfilling your request related to
                  the Platform and communicating with you in contract-related
                  matters; Marketing Communications
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">Unique identifiers</H3>
                <P size="sm" className="mb-2">
                  IP address, Cookie IDs, device IDs, as described by our Cookie
                  Notice
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you use our Platform (via
                  Cookies)
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Internal Development (as defined
                  below)
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">Device and technical data</H3>
                <P size="sm" className="mb-2">
                  Domain server, type of device/operating system/browser used to
                  access the Platform, local and language settings; session
                  logging, heatmaps and scrolls; screen resolution, ISP,
                  referring or exit pages; and date and time of your visit
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you use our Platform (via
                  Cookies)
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Internal Development
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">Digital behavioral data</H3>
                <P size="sm" className="mb-2">
                  Web page interactions (clicks, browsing, zooms and other
                  interactions), referring web page/source through which you
                  accessed the Sites, and statistics associated with the
                  interaction between device or browser and the Sites
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you use our Platform (via
                  Cookies)
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Internal Development
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">Agreement and Transaction Data</H3>
                <P size="sm" className="mb-2">
                  Agreements, orders, purchases, payment status, and invoices;
                  and your other interactions with us related to transactions,
                  such as service requests and messaging with our customer
                  service
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you order and use our Platform
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Managing payments, contracts,
                  transactions, and otherwise meeting our contractual
                  requirements
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <H3 className="mb-3">Payment Data</H3>
                <P size="sm" className="mb-2">
                  Card data, Corporate bank account information of customers
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Source:</Strong> When you order our Platform
                </P>
                <P size="sm" className="text-muted-foreground">
                  <Strong>Purpose:</Strong> Managing payments, contracts,
                  transactions, and otherwise meeting our contractual
                  requirements
                </P>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <P size="md">
                <Strong>"Marketing Communications"</Strong> means when we
                contact you about Dust's Platform, events, or business.
              </P>
              <P size="md">
                <Strong>"Internal Development"</Strong> means when Dust improves
                and better develops the Platform including testing, research,
                reporting, benchmarking, machine learning, performance analyses,
                predictions and trend analysis. We process anonymised and
                aggregated data to the extent possible.
              </P>
            </div>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>
              4. How do we use and process your Personal Data and what legal
              basis do we rely on?
            </H2>
            <P size="md">
              We always process your Personal Data in accordance with the
              applicable laws.
            </P>

            <H3 className="mt-4">
              We process your Personal Data for the following purposes:
            </H3>
            <ul className="ml-6 list-disc space-y-2">
              <li className="copy-md">
                To provide the Platform to our Customers in accordance with the
                agreement with them
              </li>
              <li className="copy-md">
                To manage our relationship with our Customers, including
                managing payments, contracts, and transactions
              </li>
              <li className="copy-md">
                Contacting our Customers about events, demos, webinars, and new
                features
              </li>
              <li className="copy-md">For internal development</li>
            </ul>

            <H3 className="mt-6">What legal basis are we relying on?</H3>
            <P size="md">We process your Personal Data based on:</P>
            <ul className="ml-6 list-disc space-y-2">
              <li className="copy-md">
                The performance of a contract with our Customers
              </li>
              <li className="copy-md">
                The necessity to comply with our legal obligations
              </li>
              <li className="copy-md">Our legitimate interest</li>
              <li className="copy-md">
                Your consent, where your consent is legally required
              </li>
            </ul>

            <P size="md" className="mt-4">
              Where we rely on your consent, you may at any time withdraw your
              consent by contacting us. See how to contact us in Section 13
              below.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>5. How long do we keep your Personal Data?</H2>
            <P size="md">
              Your Personal Data will be stored in accordance with applicable
              data protection laws and data protection authorities guidelines to
              the extent necessary for the processing purposes set out in this
              Platform Privacy Policy and in accordance with our Data Retention
              Policy.
            </P>

            <div className="flex flex-col gap-4 pt-4">
              <div className="rounded-lg bg-muted/50 p-6">
                <P size="sm" className="mb-2">
                  <Strong>
                    Delivering the Platform, providing customer service and
                    managing payments, contracts and transactions and otherwise
                    meeting our contractual requirements:
                  </Strong>
                </P>
                <P size="sm" className="text-muted-foreground">
                  For the agreement duration with Customers and then archived
                  for 5 years
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <P size="sm" className="mb-2">
                  <Strong>
                    Fulfilling your request related to the Platform and
                    communicating with you in contract-related matters:
                  </Strong>
                </P>
                <P size="sm" className="text-muted-foreground">
                  For the agreement duration with Customers and then archived
                  for 5 years
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <P size="sm" className="mb-2">
                  <Strong>Marketing Communications:</Strong>
                </P>
                <P size="sm" className="text-muted-foreground">
                  3 years from the last contact
                </P>
              </div>

              <div className="rounded-lg bg-muted/50 p-6">
                <P size="sm" className="mb-2">
                  <Strong>
                    Organizing, managing, and facilitating access to our events:
                  </Strong>
                </P>
                <P size="sm" className="text-muted-foreground">
                  For the duration of the event and 5 years in archives after
                  the end of the event
                </P>
              </div>
            </div>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>6. When and with whom do we share your Personal Data?</H2>
            <P size="md">
              Within Dust, only authorized personnel have access to your
              Personal Data.
            </P>
            <P size="md">
              We may also disclose your Personal Data to third parties to carry
              out our usual business practices. Disclosures will only be so that
              we can process your Personal Data for the purposes set out above.
              Dust may share your Personal Data to the following third parties:
            </P>

            <H3 className="mt-6">Our service providers</H3>
            <P size="md">
              Some of our service providers may perform actions on our behalf,
              under our instructions, in accordance with our agreement and in
              compliance with appropriate technical and organizational security
              measures to protect your Personal Data.
            </P>
            <P size="md">
              Dust seeks to conclude data processing agreements with its service
              providers to ensure that your personal data is used, stored and
              transferred securely and in accordance with the applicable laws
              and Dust's instructions.
            </P>
            <P size="md">
              Foundational Model Providers (OpenAI, Anthropic, Mistral, Google,
              Fireworks) are prohibited from using any customer and personal
              data for model training. They apply a "Zero Data Retention"
              policy, meaning that Customer Content will not be logged for human
              review and will not be saved to disk or retained by those
              providers. Certificates can be found in the{" "}
              <A
                variant="primary"
                href="https://dust-tt.notion.site/Sub-Processors-cb656ff3093c4aee9e080e3021e71f9c"
                target="_blank"
              >
                Sub-Processors list
              </A>
              .
            </P>

            <H3 className="mt-6">Our affiliates</H3>
            <P size="md">
              We may share, disclose and transfer your Personal Data with our
              current and future subsidiaries and affiliated companies for all
              purposes mentioned in Section 4 above.
            </P>

            <H3 className="mt-6">
              Third Parties involved in a corporate transaction
            </H3>
            <P size="md">
              We may also disclose or transfer your Personal Data to fulfil our
              legal obligations or when a legal authority requires a disclosure.
              We may also disclose your Personal Data if we are a party of a
              business sale, such as a merger or an acquisition.
            </P>

            <H3 className="mt-6">Third parties you connect to Dust</H3>
            <P size="md">
              <Strong>Google:</Strong> We access your Google User Data only to
              facilitate and enhance the functions of our application.
              Specifically, we synchronize your Google Docs, Google Slides,
              pdfs, and plain text files that are within the folders you select
              when connecting your Google Drive account to Dust. You can change
              this selection at any time or request us to delete all your data.
            </P>
            <P size="md">
              The sole purpose of this data is to allow you to use your Google
              User Data on the Dust Platform. Dust will not use this data for
              any other purpose like advertising or marketing.
            </P>
            <P size="md">
              Dust use and transfer of information received from Google API's to
              any other app will adhere to{" "}
              <A
                variant="primary"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
              >
                Google API Services User Data Policy
              </A>
              , including Limited Use requirements.
            </P>
            <P size="md">
              You can see how your data is stored securely in Section 8 below.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>7. How do we transfer your Personal Data globally?</H2>
            <P size="md">
              Your Personal Data may be accessed, transferred, stored and/or
              processed outside the European Economic Area (EEA), specifically
              in the United States. If your Personal Data is transferred outside
              the European Union (EU), we make sure that (i) the transfer is
              performed to a country recognized by an adequacy decision from the
              European commission; or (ii) the transfer is covered by
              appropriate safeguards, such as the Standard Contractual Clauses
              published by the EU commission.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>8. How do we secure your Personal Data?</H2>
            <P size="md">
              We use industry-standard physical, procedural, and electronic
              security measures to protect your Personal Data held with our
              service providers and us, and keep them updated taking into
              account the state of the art-
            </P>
            <P size="md">
              More precisely, we store the usage data inside of an encrypted
              database, inaccessible from the Internet. The data we access is
              stored securely in our database. We use PostgreSQL, Google Cloud
              infrastructure, Google Infrastructure Security Design, and Google
              Cloud Platform. We also use QDrant Cloud, which is a vector
              database to store embeddings. We commit to ensuring your data is
              safe and secure at all times.
            </P>
            <P size="md">
              Access to personal data is also protected with user-specific
              logins, passwords, and user rights. Our premises are also safe and
              secure.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>
              9. What are your privacy rights, and how can you exercise them?
            </H2>
            <P size="md">
              Subject to applicable data protection laws, you have privacy
              rights in respect of the Personal Data we process about you:
            </P>
            <ul className="ml-6 list-disc space-y-2">
              <li className="copy-md">
                Request confirmation that we are processing your Personal Data
              </li>
              <li className="copy-md">
                Request access to the Personal Data we process about you
              </li>
              <li className="copy-md">
                Request that we delete, update or correct the Personal Data we
                hold about you
              </li>
              <li className="copy-md">
                Request that we restrict the way in which we use your Personal
                Data
              </li>
              <li className="copy-md">
                Request that we apply the right of data portability, where
                applicable
              </li>
              <li className="copy-md">
                Object to our Processing of your Personal Data
              </li>
              <li className="copy-md">
                Withdraw the consent that you have given us to process your
                Personal Data where we process it on the basis of your consent
              </li>
              <li className="copy-md">
                Lodge a complaint with the relevant data protection authority
                regarding our Processing of your Personal Data
              </li>
            </ul>
            <P size="md" className="mt-4">
              To exercise one or more of the rights mentioned above, please
              contact us as outlined in Section 13 below.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>10. Your California Privacy Rights</H2>
            <P size="md">
              If you are a California resident, California Civil Code Section
              1798.83 permits you to request information regarding the
              disclosure of personal information to third parties for their
              direct marketing purposes during the immediately preceding
              calendar year. You may make one request each year by emailing us
              at{" "}
              <A variant="primary" href="mailto:privacy@dust.tt">
                privacy@dust.tt
              </A>
              .
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>11. Children's Privacy</H2>
            <P size="md">
              Our Platform is not designed to attract children under the age of
              16. We do not knowingly collect Personal Data from children and do
              not wish to do so. If we learn that a person under the age of 16
              is using our Platform, we will prohibit and attempt to block such
              use and will make reasonable efforts to promptly delete any
              Personal Data stored with us with regard to such person. If you
              believe that we might have any such data, please contact us as
              outlined in Section 13 below.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>12. Links to other websites or services</H2>
            <P size="md">
              Our Website or Platform may include links to third-party websites
              and services that are not operated by us. When you click these
              links, you will be directed away from our Website or Platform. A
              link to a third-party website or service does not mean that we
              endorse it or the quality or accuracy of information presented on
              it. If you decide to visit a third-party website or service, you
              are subject to its privacy practices and policies, not ours. This
              Privacy Policy does not apply to any Personal Data that you
              provide to these other websites and services.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>13. How to contact us?</H2>
            <P size="md">
              You may contact us regarding this Platform Privacy Policy or our
              Processing of your Personal Data at{" "}
              <A variant="primary" href="mailto:privacy@dust.tt">
                privacy@dust.tt
              </A>
              .
            </P>
            <P size="md">
              You can also contact our Data Protection Officer at{" "}
              <A variant="primary" href="mailto:dpo@dust.tt">
                dpo@dust.tt
              </A>
              .
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-4",
              "col-span-12 md:col-span-10 md:col-start-2"
            )}
          >
            <H2>14. Updates and Amendments to this Platform Privacy Policy</H2>
            <P size="md">
              The "Effective Date" at the top of this webpage mentions when this
              Platform Privacy Policy was last revised. We may update and amend
              this Platform Privacy Policy from time to time. Any changes will
              become effective when we post a revised version of this Platform
              Privacy Police.
            </P>
            <P size="md">
              If we make changes that materially alter your privacy rights, Dust
              will provide additional notice, such as via email or through the
              platform directly.
            </P>
            <P size="md">
              Your use of our Platform is subject to the terms in the version of
              this Platform Privacy Policy that is posted at the time of your
              use of the Platform and we encourage you to review this Platform
              Privacy Policy any time you use our Platform.
            </P>
          </div>
        </Grid>

        <Grid>
          <div
            className={classNames("col-span-12 md:col-span-10 md:col-start-2")}
          >
            <div className="rounded-2xl border-2 border-highlight/20 bg-highlight/5 p-8">
              <P size="md">
                💡 If you're looking for the privacy policy of our Website,
                please check this page:{" "}
                <A
                  variant="primary"
                  href="https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084"
                  target="_blank"
                >
                  Website Privacy Policy
                </A>
              </P>
            </div>
          </div>
        </Grid>
      </div>
    </>
  );
}

PlatformPrivacy.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
