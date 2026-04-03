declare module "@mixmark-io/domino" {
  function createDOMImplementation(): DOMImplementation;
  function createDocument(html?: string, force?: boolean): Document;
  function createWindow(html?: string, address?: string): Window;
}
