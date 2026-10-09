#!/bin/bash
set -euo pipefail
project=dust-dev
prefix=gcs-dfs-jd-20261008
bucket=dust-dev-gcs-dfs-jd-20261008
worker=gcs-dfs-jd-20261008@dust-dev.iam.gserviceaccount.com
gcloud storage buckets create "gs://$bucket" --project="$project" --location=us-central1 --uniform-bucket-level-access --public-access-prevention --quiet
gcloud storage buckets update "gs://$bucket" --clear-soft-delete --quiet
gcloud pubsub topics create "$prefix" "$prefix-dead" --project="$project" --labels=owner=jd,purpose=gcs-dfs-sync --quiet
gcloud pubsub subscriptions create "$prefix-dead" --topic="$prefix-dead" --project="$project" --message-retention-duration=14d --expiration-period=never --quiet
gcloud pubsub subscriptions create "$prefix" --topic="$prefix" --project="$project" --ack-deadline=60 --message-retention-duration=7d --expiration-period=never --dead-letter-topic="$prefix-dead" --max-delivery-attempts=10 --min-retry-delay=10s --max-retry-delay=600s --quiet
project_number=$(gcloud projects describe "$project" --format='value(projectNumber)')
storage_agent=$(gcloud storage service-agent --project="$project")
gcloud pubsub topics add-iam-policy-binding "$prefix" --project="$project" --member="serviceAccount:$storage_agent" --role=roles/pubsub.publisher --quiet >/dev/null
gcloud pubsub topics add-iam-policy-binding "$prefix-dead" --project="$project" --member="serviceAccount:service-$project_number@gcp-sa-pubsub.iam.gserviceaccount.com" --role=roles/pubsub.publisher --quiet >/dev/null
gcloud pubsub subscriptions add-iam-policy-binding "$prefix" --project="$project" --member="serviceAccount:service-$project_number@gcp-sa-pubsub.iam.gserviceaccount.com" --role=roles/pubsub.subscriber --quiet >/dev/null
gcloud pubsub subscriptions add-iam-policy-binding "$prefix" --project="$project" --member="serviceAccount:$worker" --role=roles/pubsub.subscriber --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$bucket" --member="serviceAccount:$worker" --role=roles/storage.objectViewer --quiet >/dev/null
gcloud storage buckets notifications create "gs://$bucket" --topic="projects/$project/topics/$prefix" --event-types=OBJECT_FINALIZE,OBJECT_METADATA_UPDATE,OBJECT_ARCHIVE,OBJECT_DELETE --payload-format=json --quiet
