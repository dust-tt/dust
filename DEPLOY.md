# Deployment Instructions

## Deploying on fly.io

[fly.io](https://fly.io/) is a platform that offers deployment and hosting services for your applications. Here is a step-by-step guide to deploying your application using fly.io.

### Step 1: Prepare dependencies

1. Create a Postgres database using the following command:

    ```bash
    flyctl postgres create
    # choose a unique name: <dust-db-name>
    # choose a region for all apps.
    ```

    This command will create a new Postgres instance on fly.io, which you can use as the database for your application.

2. Create a GitHub OAuth app by following the steps below:
    - Navigate to the [GitHub OAuth Apps](https://github.com/settings/developers)
    - Click on the `New OAuth App` button.
    - Fill in the details as shown below:

        | Field | Value |
        | --- | --- |
        | Application name | `<dust-front-name>` |
        | Homepage URL | `https://<dust-front-name>.fly.dev`|
        | Authorization callback URL | `https://<dust-front-name>.fly.dev/api/auth/callback/github` |

3. Create a [qdrant](https://qdrant.tech/) vector database.
    - You can create a free account on [qdrant.cloud](https://qdrant.cloud/).
    - Or you can deploy qdrant on your own server.
    - After creating the database, you will get the `url` and `api_key` for the database.
    - URL is GRPC endpoint, if you use qdrant.cloud, you can find it by following the steps below:
        - Instance -> `Show code example` -> `grpcurl` -> `xxxxx:6334`
        - Then add `https://` to the beginning of the URL.

4. Create a [Google Cloud Storage](https://console.cloud.google.com/storage/) bucket for save the documents.
    - Create a Service Account with the `Storage Object Admin` and `Service Account Token Creator` role.
        - <https://console.cloud.google.com/iam-admin/serviceaccounts>
    - Create private key for Service Account, and Download the JSON key file.
    - Rename the JSON key file to `key.json`.
    - Run `cat key.json | base64` to get the base64 encoded key.

### Step 2: Deploy the dust-api

Next, deploy the dust-api by following the steps below:

1. Navigate to the `core/` directory of your project using the command line.
2. Modify the `fly.toml` file with your project details.

    ```toml
    app = "<dust-api project name>"
    primary_region = "nrt"

    [env]
      DUST_FRONT_API = "https://<dust-front-name>.fly.dev"
    ```

3. Attach the Postgres database to your application using the command:

    ```bash
    flyctl pg attach <dust-db-name>
    ```

4. Set secrets using the command:

    ```bash
    flyctl secrets set CORE_DATABASE_URI="postgres://..."
    flyctl secrets set DUST_REGISTRY_SECRET="<random_generated_string>"
    flyctl secrets set QDRANT_URL="<qdrant_url>"
    flyctl secrets set QDRANT_API_KEY="<qdrant_api_key>"
    flyctl secrets set DUST_DATA_SOURCES_BUCKET="<gcs_bucket_name>"
    flyctl secrets set SERVICE_ACCOUNT="key.json"
    flyctl secrets set KEY_JSON_BASE64=$(cat key.json | base64)
    ```

5. Deploy the application using the command:

    ```bash
    flyctl deploy
    ```

### Step 3: Deploy the dust-front

Finally, deploy the dust-front by following the steps below:

1. Navigate to the `front/` directory of your project using the command line.
2. Modify the `fly.toml` file with your project details.

    ```toml
    app = "<dust-front-name>"
    primary_region = "nrt"

    [env]
      PORT = "8080"
      URL = "https://<dust-front-name>.fly.dev"
      NEXTAUTH_URL = "https://<dust-front-name>.fly.dev"
      DUST_API = "http://<dust-api-name>.internal:3001"
      THUM_IO_KEY = "0-Foo"
      GA_TRACKING_ID = "Foo"
    ```

3. Attach the Postgres database to your application using the command:

    ```bash
    flyctl pg attach <db-app-name>
    ```

4. Proxy the database using the command:

    ```bash
    fly proxy 5432 -a <db-app-name>
    ```

5. Initialize the database using the command:

    ```bash
    # postgres host set to localhost because the database is proxied.
    XP1_DATABASE_URI=sqlite:xp1_store.sqlite FRONT_DATABASE_URI="postgres://...<change hostname to localhost>" ./init/init.sh
    ```

6. Set secrets using the command:

    ```bash
    flyctl secrets set FRONT_DATABASE_URI="postgres://..."
    # xp1_store is not used in the front-end, so just set it to a dummy value.
    flyctl secrets set XP1_DATABASE_URI="sqlite:xp1_store.sqlite"
    flyctl secrets set NEXTAUTH_SECRET="<random string>"
    # Create the GitHub OAuth app with the callback path `/api/auth/callback/github`.
    flyctl secrets set GITHUB_ID="..."
    flyctl secrets set GITHUB_SECRET="..."
    # Same with dust-core.
    flyctl secrets set DUST_REGISTRY_SECRET="<random_generated_string>"
    ```

7. Deploy the application using the command:

    ```bash
    flyctl deploy
    ```

Congratulations! You have successfully deployed your application on fly.io.
You can visit your application at `https://<dust-front-name>.fly.dev`.
