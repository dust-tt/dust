# Estimating Qdrant shard memory

The `--estimate-memory` mode in
[`qdrant_shard_rebalance_suggestions.rs`](qdrant_shard_rebalance_suggestions.rs)
fits shard RAM from node totals and replica placement, then suggests one move.

## Memory estimates

For a replica of logical shard $j$ currently on node $i$, estimate its RAM as:

$$
\hat r_{ij} = M_i \frac{p_{ij}}{P_i}
$$

Here, $M_i$ is measured allocator-resident RAM, $p_{ij}$ is the replica's point
count, and $P_i$ is the node's total point count. Average these estimates over
the shard's current hosting nodes $S_j$:

$$
r_j^0 = \frac{1}{k_j} \sum_{i \in S_j} \hat r_{ij},
\qquad k_j = |S_j|
$$

Use these averages as starting estimates. Let $A_{ij}=1$ when node $i$ currently
hosts shard $j$, and $0$ otherwise. Fit one nonnegative RAM cost per logical
shard, shared by all its replicas:

$$
\min_{r \ge 0}\; \sum_i\left(M_i-\sum_j A_{ij}r_j\right)^2
  + \lambda\sum_j(r_j-r_j^0)^2, \qquad \lambda=0.01
$$

Overlapping placements constrain shard costs through multiple node totals.
With more shards than nodes, the measurements cannot determine every cost
uniquely. The weak penalty toward the starting estimates makes the fit unique,
trading a small amount of fit accuracy for stability. All measured RAM,
including process overhead and temporary allocations, contributes to the fit.

The script uses coordinate descent with no added dependency. With residual
$e_i=M_i-\sum_j A_{ij}r_j$, update each shard in collection/shard order:

$$
r'_j=\max\left(0,\;r_j+
  \frac{\sum_{i\in S_j}e_i-\lambda(r_j-r_j^0)}{k_j+\lambda}\right)
$$

Subtract $r'_j-r_j$ from the residual of each hosting node before updating the
next shard. Each update minimizes the objective for that coordinate. Stop when
the largest update in a sweep is at most $10^{-8}\max(1,\max_i M_i)$ bytes, or
after 10,000 sweeps with a warning. The script reports node RMS error before
and after fitting. Each sweep touches roughly 140 replicas at the example scale.

Shard identity includes the collection. Fitted estimates remain fixed as moves
are simulated. All replicas of a logical shard use the same fitted cost.

## Using the estimates

The planner sums fitted costs to model each node's load. It suggests one move
from the most loaded eligible node, breaking ties by the largest reduction in
load variance. A destination cannot already host the same collection/shard.

For a replica of cost $s$ moving between loads $R_a$ and $R_b$, require
$0<s<R_a-R_b$. Both $s$ and $R_a-R_b-s$ must exceed $10^{-9}$ times the initial
maximum modeled load, with a one-byte minimum scale. This excludes roundoff
that could make equal-load swaps appear improving.

## Limits

Fitted costs assume equal RAM across replicas. They include overhead but do not
measure individual payload indexes. Modeled node loads can differ from measured
RAM, especially for replicas in different states. Memory on nodes without replicas
cannot be attributed to a shard and is omitted from placement loads, but still
contributes to the reported fit error. Physical capacity and temporary transfer
memory are not checked.

The script prints suggestions and never executes them. Execute moves one at a
time and refresh the snapshot before acting on later suggestions.
