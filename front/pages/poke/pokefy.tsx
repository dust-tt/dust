import type { ReactElement } from "react";
import { useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { convertUrlToPoke } from "@app/lib/utils/url-to-poke";

export const getServerSideProps = withSuperUserAuthRequirements<{
  initialUrl?: string;
  initialPokeUrl?: string;
  initialError?: string;
}>(async (context) => {
  const { url } = context.query;

  // If URL is provided as query parameter, try to convert it
  if (url && typeof url === "string") {
    let fullUrl = url;

    // Add protocol if missing
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
      if (fullUrl.startsWith("dust.tt/") || fullUrl.startsWith("eu.dust.tt/")) {
        fullUrl = "https://" + fullUrl;
      } else if (fullUrl.startsWith("w/")) {
        const host = context.req.headers.host || "dust.tt";
        fullUrl = `https://${host}/${fullUrl}`;
      } else {
        fullUrl = "https://" + fullUrl;
      }
    }

    try {
      const pokeUrl = convertUrlToPoke(fullUrl);

      if (pokeUrl) {
        const pokeUrlObj = new URL(pokeUrl);
        return {
          props: {
            initialUrl: fullUrl,
            initialPokeUrl: pokeUrlObj.pathname + pokeUrlObj.search,
          },
        };
      } else {
        return {
          props: {
            initialUrl: fullUrl,
            initialError: "No poke page available for this URL",
          },
        };
      }
    } catch (error) {
      return {
        props: {
          initialUrl: fullUrl,
          initialError: "Invalid URL format",
        },
      };
    }
  }

  return { props: {} };
});

interface PokefyPageProps {
  initialUrl?: string;
  initialPokeUrl?: string;
  initialError?: string;
}

function PokefyPage({
  initialUrl,
  initialPokeUrl,
  initialError,
}: PokefyPageProps) {
  const [url, setUrl] = useState(initialUrl || "");
  const [error, setError] = useState(initialError || "");
  const [result, setResult] = useState<string | null>(initialPokeUrl || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!url) {
      setError("Please enter a URL");
      return;
    }

    let fullUrl = url.trim();

    // Add protocol if missing
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
      if (fullUrl.startsWith("dust.tt/") || fullUrl.startsWith("eu.dust.tt/")) {
        fullUrl = "https://" + fullUrl;
      } else if (fullUrl.startsWith("w/")) {
        fullUrl = `https://${window.location.hostname}/${fullUrl}`;
      } else {
        fullUrl = "https://" + fullUrl;
      }
    }

    try {
      const pokeUrl = convertUrlToPoke(fullUrl);

      if (pokeUrl) {
        const pokeUrlObj = new URL(pokeUrl);
        // Show the poke URL instead of redirecting
        setResult(pokeUrlObj.pathname);
      } else {
        setError("No poke page available for this URL");
      }
    } catch (err) {
      setError("Invalid URL format");
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold">Convert webapp URLs to Poke</h1>

      <form onSubmit={handleSubmit} className="mt-6">
        <div>
          <label htmlFor="url" className="mb-2 block text-sm font-medium">
            Enter URL to convert:
          </label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://dust.tt/w/workspace/assistant/conversation"
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Convert to Poke URL
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4">
          <p className="mb-2 text-green-700">
            ✅ <strong>Poke URL available:</strong>
          </p>
          <p className="text-lg">
            <a
              href={result}
              className="font-bold text-blue-600 hover:text-blue-800"
            >
              {result}
            </a>
          </p>
        </div>
      )}

      <div className="mt-10 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
        <h3 className="mb-2 font-semibold">Usage examples:</h3>
        <ul className="space-y-1">
          <li>
            Enter full URL:{" "}
            <code className="rounded bg-gray-200 px-1">
              https://dust.tt/w/workspace/assistant/conv123
            </code>
          </li>
          <li>
            Protocol optional:{" "}
            <code className="rounded bg-gray-200 px-1">
              dust.tt/w/workspace/assistant/conv123
            </code>
          </li>
          <li>
            EU subdomain:{" "}
            <code className="rounded bg-gray-200 px-1">
              eu.dust.tt/w/workspace/assistant/conv123
            </code>
          </li>
          <li>
            Just the path:{" "}
            <code className="rounded bg-gray-200 px-1">
              w/workspace/assistant/conv123
            </code>{" "}
            (uses current domain)
          </li>
        </ul>
      </div>
    </div>
  );
}

PokefyPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Pokefy">{page}</PokeLayout>;
};

export default PokefyPage;
