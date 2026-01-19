import type { AttributionData } from "../types";

/**
 * Get UTM data formatted for GTM dataLayer push.
 * Returns an object with both last-touch (for conversion credit) and first-touch (for analysis).
 */
export function getAttributionForGTM(attribution: AttributionData): {
  // Last-touch (standard UTM fields for conversion credit)
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  li_fat_id?: string;
  // First-touch (prefixed for analysis)
  first_touch_source?: string;
  first_touch_medium?: string;
  first_touch_campaign?: string;
  first_touch_gclid?: string;
} {
  const { firstTouch, lastTouch } = attribution;

  return {
    // Last-touch for conversion credit
    utm_source: lastTouch?.utm_source,
    utm_medium: lastTouch?.utm_medium,
    utm_campaign: lastTouch?.utm_campaign,
    utm_content: lastTouch?.utm_content,
    utm_term: lastTouch?.utm_term,
    gclid: lastTouch?.gclid,
    fbclid: lastTouch?.fbclid,
    msclkid: lastTouch?.msclkid,
    li_fat_id: lastTouch?.li_fat_id,
    // First-touch for analysis
    first_touch_source: firstTouch?.utm_source,
    first_touch_medium: firstTouch?.utm_medium,
    first_touch_campaign: firstTouch?.utm_campaign,
    first_touch_gclid: firstTouch?.gclid,
  };
}
