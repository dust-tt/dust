import { FC } from "react";
import { Content, isFilled } from "@prismicio/client";
import { SliceComponentProps, PrismicRichText } from "@prismicio/react";
import { PrismicNextLink, PrismicNextImage } from "@prismicio/next";

export type CallToActionProps = SliceComponentProps<Content.CallToActionSlice>;

const CallToAction: FC<CallToActionProps> = ({ slice }) => {
  const alignment = slice.variation === "alignLeft" ? "left" : "center";

  return (
    <section
      data-slice-type={slice.slice_type}
      data-slice-variation={slice.variation}
      className="es-bounded es-call-to-action"
    >
      <div className="es-bounded__content es-call-to-action__content">
        {isFilled.image(slice.primary.image) && (
          <PrismicNextImage
            className="es-call-to-action__image"
            field={slice.primary.image}
          />
        )}
        <div className="es-call-to-action__content">
          {isFilled.richText(slice.primary.title) && (
            <div className="es-call-to-action__content__heading">
              <PrismicRichText field={slice.primary.title} />
            </div>
          )}
          {isFilled.richText(slice.primary.paragraph) && (
            <div className="es-call-to-action__content__paragraph">
              <PrismicRichText field={slice.primary.paragraph} />
            </div>
          )}
        </div>
        <PrismicNextLink
          className="es-call-to-action__button"
          field={slice.primary.buttonLink}
        />
      </div>

      <style>
        {`
          .es-bounded {
            padding: 8vw 2rem;
          }

          .es-bounded__content {
            margin-left: auto;
            margin-right: auto;
          }

          @media screen and (min-width: 640px) {
            .es-bounded__content {
              max-width: 90%;
            }
          }

          @media screen and (min-width: 896px) {
            .es-bounded__content {
              max-width: 80%;
            }
          }

          @media screen and (min-width: 1280px) {
            .es-bounded__content {
              max-width: 75%;
            }
          }

          .es-call-to-action {
            font-family: system-ui, sans-serif;
            background-color: #fff;
            color: #333;
          }

          .es-call-to-action__image {
            max-width: 14rem;
            height: auto;
            width: auto;
            justify-self: ${alignment};
          }

          .es-call-to-action__content {
            display: grid;
            gap: 1rem;
            justify-items: ${alignment};
          }

          .es-call-to-action__content__heading {
            font-size: 2rem;
            font-weight: 700;
            text-align: ${alignment};
          }

          .es-call-to-action__content__heading * {
            margin: 0;
          }

          .es-call-to-action__content__paragraph {
            font-size: 1.15rem;
            max-width: 38rem;
            text-align: ${alignment};
          }

          .es-call-to-action__button {
            justify-self: ${alignment};
            border-radius: 0.25rem;
            display: inline-block;
            font-size: 0.875rem;
            line-height: 1.3;
            padding: 1rem 2.625rem;
            text-align: ${alignment};
            transition: background-color 100ms linear;
            background-color: #16745f;
            color: #fff;
          }

          .es-call-to-action__button:hover {
            background-color: #0d5e4c;
          }
        `}
      </style>
    </section>
  );
};

export default CallToAction;
