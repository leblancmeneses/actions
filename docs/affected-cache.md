- [Affected Cache Action](#affected-cache-action)
  - [S3-Compatible Storage](#s3-compatible-storage)
  - [Provider Configuration](#provider-configuration)
  - [Problems with doing this manually?](#problems-with-doing-this-manually)
  - [Single Job Pipeline Usage](#single-job-pipeline-usage)
  - [Multi Job Pipeline Usage](#multi-job-pipeline-usage)


# Affected Cache Action

This task is designed to help you cache jobs or tasks completed to speed up your pipeline. It consumes outputs from the Affected Action to identify the project targets and their corresponding SHA revision. Additionally, it leverages the Pragma Action to handle scenarios where caching should be bypassed, such as when a pull request requires skipping the cache. `x__skip-cache=true` or `x__target-cache='skip'`

By using this Cache Action in conjunction with the Affected Action, you can significantly reduce build times and enhance the efficiency of your pipelines.


## S3-Compatible Storage

This action uses S3-compatible storage APIs, which means it works with multiple cloud storage providers without code changes. The action requires the following inputs:

| Input | Required | Description |
|-------|----------|-------------|
| `access-key` | Yes | S3-compatible access key |
| `secret-key` | Yes | S3-compatible secret key |
| `endpoint` | No | S3-compatible endpoint URL |
| `region` | No | S3 region (default: `auto`) |
| `storage-path` | No | Root path for cache storage (e.g., `s3://bucket/prefix`) |


## Provider Configuration

The following table shows how to configure the action for different S3-compatible storage providers:

| Input | AWS S3 | GCS (HMAC) | MinIO | SeaweedFS |
|-------|--------|------------|-------|-----------|
| `access-key` | AWS Access Key ID | [HMAC Access ID](https://cloud.google.com/storage/docs/authentication/managing-hmackeys) | MinIO Access Key | SeaweedFS Access Key |
| `secret-key` | AWS Secret Access Key | [HMAC Secret](https://cloud.google.com/storage/docs/authentication/managing-hmackeys) | MinIO Secret Key | SeaweedFS Secret Key |
| `endpoint` | *(not required)* | `https://storage.googleapis.com` | `https://minio.example.com` | `https://seaweedfs.example.com:8333` |
| `region` | `us-east-1` (or your region) | `auto` | `us-east-1` | `us-east-1` |
| `storage-path` | `s3://bucket/prefix` | `gs://bucket/prefix` | `s3://bucket/prefix` | `s3://bucket/prefix` |

### GCS HMAC Keys

To use Google Cloud Storage with this action, you need to create HMAC keys:

1. Go to [Cloud Storage Settings](https://console.cloud.google.com/storage/settings) in the Google Cloud Console
2. Select the **Interoperability** tab
3. Create a new HMAC key for a service account
4. Use the **Access Key** as `access-key` and **Secret** as `secret-key`

For more details, see [Managing HMAC keys](https://cloud.google.com/storage/docs/authentication/managing-hmackeys).


## Problems with doing this manually?

Here is a basic scaffold of how DIY caching might look like in a GitHub Action.

```yaml
    env:
      EXPECTED_S3_FILE: "s3://github-integration/mobile-android/${{inputs.CACHE_KEY}}"
    steps:
      - name: calculated variables
        shell: bash
        run: |
          if aws s3 ls "$EXPECTED_S3_FILE"; then
            echo "RUN_BUILD=false" >> $GITHUB_ENV
          else
            echo "RUN_BUILD=true" >> $GITHUB_ENV
          fi

      - name: expensive work here
        if: |
          !failure() && !cancelled() && env.RUN_BUILD == 'true'
        run: bash ./gradlew assembleDebug --stacktrace

      - name: cache results
        if: |
          !failure() && !cancelled() && env.RUN_BUILD == 'true'
        run: |
          touch "file.txt" && aws s3 cp "file.txt" $EXPECTED_S3_FILE
```

This sample shows that consideration is required in constructing your cache keys. You need to set environment variables for your cache-hit outputs and ensure the cache write step is placed at the end of the job. The more tasks and targets you want to cache within the same job, the more complex and code-intensive it becomes.

In a multi-job pipeline, this job would still need to be executed to determine if the expensive work should be skipped. If the cache-hits could be effeciently pre calculated upfront, the pipeline would be faster and shave minutes by pruning jobs that have a cache-hit and not needed.

Using the Affected Cache Action simplifies this process, efficiently handling caching in both single and multi-job pipelines, and reducing the amount of manual work required.


## Single Job Pipeline Usage

See the [single job pipeline](../.github/workflows/ci.yml) in this repo that shows how we use the cache task internally.
By setting the optional `additional-keys`, we get additional keys projected to the cache object in the form of `<target>-<key>`.

```yaml
      # The following calculates the cache key, path, and hit status. It will not write to the cache.
      - name: calculate cache
        id: cache
        uses: ./apps/affected-cache
        with:
          access-key: ${{ secrets.CACHE_ACCESS_KEY }}
          secret-key: ${{ secrets.CACHE_SECRET_KEY }}
          endpoint: ${{ vars.CACHE_ENDPOINT }}  # optional, for GCS/MinIO/SeaweedFS
          region: ${{ vars.CACHE_REGION }}      # optional
          affected: ${{steps.affected.outputs.affected}}
          pragma: ${{steps.pragma.outputs.pragma}}
          storage-path: s3://opensource-github-integration/build-cache
          additional-keys: |
            { "affected": ["build", "docker"] }
```

By binding `affected` output we get all the original targets in the project.
`fromJson(steps.cache.outputs.cache).affected.cache-hit == false` with `additional-keys` projects more fields to the cache object.
That can be read using: `fromJson(steps.cache.outputs.cache).affected-build.cache-hit == false` and `fromJson(steps.cache.outputs.cache).affected-docker.cache-hit == false`.


By binding `pragma` output we grant developers the ability to override the cache through a pull request.
Globally using `x__skip-cache=true` or on a per target basis, `x__affected-docker='skip'`.


```yaml
      # The following writes to the cache immediately when the pipeline reaches this step. (useful in single job pipelines)
      # The default is multi-job pipelines with write-on: 'post' which only writes on success of the entire job and can be placed anywhere in the job but after the S3 credentials are available.
      - name: write pragma cache
        uses: ./apps/affected-cache
        with:
          access-key: ${{ secrets.CACHE_ACCESS_KEY }}
          secret-key: ${{ secrets.CACHE_SECRET_KEY }}
          endpoint: ${{ vars.CACHE_ENDPOINT }}
          write-on: immediate
          cache_key_path: ${{fromJson(steps.cache.outputs.cache).pragma.path}}
```



## Multi Job Pipeline Usage

The key to this is described in the [README.md](../README.md#recommendations-for-multi-job-pipeline) with scaffold of an init phase.

The init phase is used to precomute the cache keys and cache hit status for all targets in the project.  Using this we can prune jobs where we have a cache-hit and pass the specific cache object to the job so that it can **write** to the cache on `post` success.

> [!NOTE]
> `additional-keys` is useful if you have a target that is split across multiple jobs and you want to cache each job separately.
> This is useful for parallel jobs that build different parts of the same target.  It works the same way as described above
> in how the keys are projected into the cache object.


```yaml
# .github/workflows/build.yml
jobs:
  vars:
    uses: ./.github/workflows/template.job.init.yml
    secrets:
      CACHE_ACCESS_KEY: ${{secrets.CACHE_ACCESS_KEY}}
      CACHE_SECRET_KEY: ${{secrets.CACHE_SECRET_KEY}}

  # task uses affected and cache-hit to determine whether the job should be pruned from execution.
  build-api:
    needs: [vars]
    uses: ./.github/workflows/template.job.docker.yml
    if: |
      !failure() && !cancelled() && (
        inputs.MANUAL_FORCE_BUILD == 'true' || (
          fromJson(needs.vars.outputs.affected).build-api.changes == true &&
          fromJson(needs.vars.outputs.cache).build-api.cache-hit == false
        )
      )
    with:
      CACHE: ${{toJson(fromJson(needs.vars.outputs.cache).build-api)}}
      DOCKER_FILE: "./build-api/Dockerfile"
      DOCKER_BUILD_ARGS: "IS_PULL_REQUEST=${{github.event_name == 'pull_request'}}"
      DOCKER_CONTEXT: "./build-api"
      DOCKER_LABELS: ${{needs.vars.outputs.IMAGE_LABELS}}
      DOCKER_IMAGE_TAGS: ${{ fromJson(needs.vars.outputs.affected).build-api.recommended_imagetags &&
           toJson(fromJson(needs.vars.outputs.affected).build-api.recommended_imagetags) || '[]' }}
      version_offsets: '{"MAJOR":5, "MINOR": 1, "SHIFT": 0}'
    secrets:
      CACHE_ACCESS_KEY: ${{secrets.CACHE_ACCESS_KEY}}
      CACHE_SECRET_KEY: ${{secrets.CACHE_SECRET_KEY}}

```

```yaml
# .github/workflows/template.job.docker.yml
name: template.job.docker

on:
  workflow_call:
    secrets:
      CACHE_ACCESS_KEY:
        description: "S3-compatible access key"
        required: true
      CACHE_SECRET_KEY:
        description: "S3-compatible secret key"
        required: true
    inputs:
      CACHE:
        description: "Optional input for caching."
        required: false
        type: string
        default: '{}'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: checkout code
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      # can be put anywhere in the job but after credentials are available.
      # cache will be written on success of the entire job.
      - name: write cache
        uses: leblancmeneses/actions/apps/affected-cache@main
        with:
          access-key: ${{ secrets.CACHE_ACCESS_KEY }}
          secret-key: ${{ secrets.CACHE_SECRET_KEY }}
          endpoint: ${{ vars.CACHE_ENDPOINT }}
          cache_key_path: ${{fromJson(inputs.CACHE).path}}

      - name: apk generation for prod
        if:  |
          !failure() && !cancelled() && github.ref_name == 'prod' && fromJson(inputs.CACHE).cache-hit == false
        run: |
            ./gradlew bundleRelease --stacktrace
```
