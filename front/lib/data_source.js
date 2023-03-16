export async function lookUpDataSource(project_id, data_source_id) {
  const [res] = await Promise.all([
    fetch(
      `/api/data_sources/lookup?project_id=${project_id}&data_source_id=${data_source_id}`
    ),
  ]);

  if (!res.ok) {
    console.log(
      `Error looking up dataSource: projcet_id=${project_id} data_source_id=${data_source_id} status=${res.status}`
    );
    return null;
  }

  const data = await res.json();

  return data;
}
