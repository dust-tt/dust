async function main() {
  const apiUrl = "http://localhost:3000";

  const wId = "WNp5rb4EIx";
  const appId = "ArRLw8h7M0";
  const vaultId = "vlt_M3noynRxIM";
  const runId =
    "2f08d1197ea3932191c6ab33fe5eed7bdaec6862b5481df27c4516ca60c9b313";
  const h = "708f08b1a67256fefe6ab8bad051442cf00c610346272d744641e767784ec554";

  const key = "sk-e6d76de86cf58e002272f744b9d2ff10";

  const headers: RequestInit["headers"] = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  // const url = `${apiUrl}/api/v1/w/${wId}/vaults/${vaultId}/apps/${appId}/runs/${runId}`;
  const url = `${apiUrl}/api/v1/w/${wId}/vaults/${vaultId}/apps/${appId}/runs`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      specification_hash: h,
      config: {},
      stream: false,
      blocking: true,
      inputs: [],
    }),
  });

  if (!res.ok) {
    console.error(res.statusText);
    return;
  }

  console.log(await res.json());
}

main().catch(console.error);
