import Link from "@tiptap/extension-link";

export function makeLinkExtension() {
  return Link.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: "https",
    linkOnPaste: true,
    protocols: ["http", "https"],
    HTMLAttributes: {
      class: "text-blue-500",
    },
    isAllowedUri: (url, ctx) => {
      try {
        // Construct URL.
        const parsedUrl = url.includes(":")
          ? new URL(url)
          : new URL(`${ctx.defaultProtocol}://${url}`);

        // Use default validation.
        if (!ctx.defaultValidate(parsedUrl.href)) {
          return false;
        }

        // Disallowed protocols.
        const disallowedProtocols = ["ftp", "file", "mailto"];
        const protocol = parsedUrl.protocol.replace(":", "");

        if (disallowedProtocols.includes(protocol)) {
          return false;
        }

        // Only allow protocols specified in ctx.protocols.
        const allowedProtocols = ctx.protocols.map((p) =>
          typeof p === "string" ? p : p.scheme
        );

        if (!allowedProtocols.includes(protocol)) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
  });
}
