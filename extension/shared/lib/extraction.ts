/** DOM content extraction – runs inside the page context via chrome.scripting.executeScript. */

/**
 * Returns a function that extracts the page's body innerHTML.
 */
export const extractPage = () => {
  return () => document.body.innerHTML;
};
