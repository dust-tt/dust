UPDATE "public"."run_usages"
SET
    "costMicroUsd" = "costUsd" * 1000000
WHERE
    "costUsd" > 0
    AND "costMicroUsd" = 0;