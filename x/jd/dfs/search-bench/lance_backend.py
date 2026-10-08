import time

import lancedb
import pyarrow as pa
import sqlglot
from lancedb.expr import col, lit
from lancedb.query import MatchQuery, PhraseQuery
from sqlglot import exp

from dfs import paths_from_view


def canonical_filter(value):
    if len(value.encode()) > 4096:
        raise ValueError("filter exceeds benchmark byte limit")
    try:
        statements = sqlglot.parse("SELECT 1 WHERE " + value, read="postgres")
    except sqlglot.errors.ParseError as error:
        raise ValueError("invalid filter expression") from error
    if len(statements) != 1 or not isinstance(statements[0], exp.Select):
        raise ValueError("expected one filter expression")
    statement = statements[0]
    if any(v for k, v in statement.args.items() if k not in {"expressions", "where"}):
        raise ValueError("query clauses are not filter expressions")
    condition = statement.args["where"].this
    for item in condition.walk():
        if isinstance(item, exp.Query):
            raise TypeError("subqueries are not supported in benchmark filters")
        if isinstance(item, exp.Column) and (
            item.table or item.name not in {"basename", "kind"}
        ):
            raise ValueError("filter references a non-public benchmark column")
    return condition.sql(dialect="postgres", comments=False)


class LanceBackend:
    def __init__(self, path, dfs, rows):
        self.path = path
        self.dfs = dfs
        self.db = lancedb.connect(str(path))
        self.nodes = self.db.create_table(
            "nodes",
            pa.Table.from_pylist(
                [{k: v for k, v in row.items() if k != "text"} for row in rows]
            ),
        )
        self.contents = self.db.create_table(
            "contents",
            pa.Table.from_pylist([row for row in rows if row["kind"] == "File"]),
        )
        self.nodes.create_fts_index("basename", stem=False, remove_stop_words=False)
        self.contents.create_fts_index(
            "text", stem=False, remove_stop_words=False, with_position=True
        )
        self.nodes.create_scalar_index("node_id")
        self.contents.create_scalar_index("node_id")

    def reopen(self):
        self.db = lancedb.connect(str(self.path))
        self.nodes = self.db.open_table("nodes")
        self.contents = self.db.open_table("contents")

    def replace(self, row):
        self.nodes.merge_insert(
            "node_id"
        ).when_matched_update_all().when_not_matched_insert_all().execute(
            [{k: v for k, v in row.items() if k != "text"}]
        )
        self.contents.merge_insert(
            "node_id"
        ).when_matched_update_all().when_not_matched_insert_all().execute([row])

    def delete(self, node_id):
        predicate = col("node_id").eq(node_id).to_sql()
        self.nodes.delete(predicate)
        self.contents.delete(predicate)

    def search(self, case, identity, after_query=None):
        started_ns = time.perf_counter_ns()
        view = self.dfs.view(identity)
        authorized = {
            row["node"]["id"]: row
            for row in view["nodes"]
            if case["field"] == "name" or row["verbs"] & 1
        }
        authorized_ns = time.perf_counter_ns()
        table = self.nodes if case["field"] == "name" else self.contents
        if "query" in case:
            column = "basename" if case["field"] == "name" else "text"
            native = (
                PhraseQuery(case["query"], column)
                if case.get("phrase")
                else MatchQuery(
                    case["query"], column, fuzziness=case.get("fuzziness", 0)
                )
            )
            query = table.search(native, query_type="fts")
        else:
            query = table.search()
        if case.get("filter"):
            query = query.where(canonical_filter(case["filter"]))
        grant_filter = (
            col("node_id").isin(list(authorized)) if authorized else lit(False)
        )
        query = query.where(grant_filter, prefilter=True)
        rows = query.offset(case.get("offset", 0)).limit(case["limit"]).to_list()
        searched_ns = time.perf_counter_ns()
        if after_query is not None:
            after_query()
        final_view = self.dfs.view(identity)
        final = {row["node"]["id"]: row for row in final_view["nodes"]}
        visible_paths = paths_from_view(final_view)
        result = []
        for row in rows:
            current = final.get(row["node_id"])
            if current is None or (
                case["field"] == "text" and not current["verbs"] & 1
            ):
                continue
            node = current["node"]
            if (
                node["version"] != row["source_version"]
                or node["entry_token"] != row["entry_token"]
            ):
                continue
            result.append(
                {
                    "node_id": row["node_id"],
                    "basename": current["visible_name"],
                    "kind": row["kind"],
                    "source_version": row["source_version"],
                    "visible_path": visible_paths[row["node_id"]],
                    **({"text": row["text"]} if case["field"] == "text" else {}),
                    **({"_score": row["_score"]} if "_score" in row else {}),
                }
            )
        ended_ns = time.perf_counter_ns()
        return (
            result,
            {
                "authorization_ms": (authorized_ns - started_ns) / 1e6,
                "lance_ms": (searched_ns - authorized_ns) / 1e6,
                "validation_ms": (ended_ns - searched_ns) / 1e6,
                "total_ms": (ended_ns - started_ns) / 1e6,
                "eligible_count": len(authorized),
            },
            authorized,
        )
