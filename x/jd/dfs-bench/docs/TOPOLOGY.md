# Three independent systems

All 16 hosts use `c4-standard-8-lssd`, 8 vCPUs, 30 GiB RAM and 375 GiB Titanium NVMe Local SSD. A/B/C are `us-east4-a`, `us-east4-b`, `us-east4-c`. Host names share the prefix `dfs-clean-jd-20261006-`; boxes below give their suffixes. [Exact names, IPs and disk attachment metadata](../results/hosts.json).

```mermaid
flowchart LR
    subgraph R["System 1: RocksDB and Tantivy"]
        RC["rocks-client / zone A"] -->|"TLS filesystem RPC"| RS["rocks / zone A\nFrontend + RocksDB + Tantivy"]
        RC -->|"HTTPS search through local nginx"| RS
    end
    subgraph F["System 2: FoundationDB and Elasticsearch"]
        FC["fdb-client / zone A"] -->|"TLS RPC and search"| FA["fdb-a / zone A\nFrontend + FDB"]
        FA --- FB["fdb-b / zone B\nFDB"]
        FB --- FD["fdb-c / zone C\nFDB"]
        FD --- FA
        FA --> FE1["fdb-es-a / zone A"]
        FA --> FE2["fdb-es-b / zone B"]
        FA --> FE3["fdb-es-c / zone C"]
        FE1 --- FE2 --- FE3
    end
    subgraph T["System 3: TiKV and Elasticsearch"]
        TC["tikv-client / zone A"] -->|"TLS RPC and search"| TA["tikv-a / zone A\nFrontend + PD + TiKV"]
        TA --- TB["tikv-b / zone B\nPD + TiKV"]
        TB --- TD["tikv-c / zone C\nPD + TiKV"]
        TD --- TA
        TA --> TE1["tikv-es-a / zone A"]
        TA --> TE2["tikv-es-b / zone B"]
        TA --> TE3["tikv-es-c / zone C"]
        TE1 --- TE2 --- TE3
    end
```

The systems share no VM, database, ES cluster or local disk. Clients are distinct VMs in zone A. FDB and TiKV have three storage copies across three zones; their ES clusters have three primary shards with one replica per shard. Frontends are colocated with database host A. RocksDB/Tantivy has one storage host. The coordinator releases each workload phase concurrently; it is outside the measured request path.

Local SSDs hold all datasets and index files. Boot disks hold operating systems and packages. [Resource limits, consistency, durability and measurement method](METHOD.md).
