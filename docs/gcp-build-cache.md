- [GCP Build Cache Action](#gcp-build-cache-action)
  - [Problems with doing this manually?](#problems-with-doing-this-manually)
  - [Dependencies](#dependencies)
  - [Single Job Pipeline Usage](#single-job-pipeline-usage)
  - [Multi Job Pipeline Usage](#multi-job-pipeline-usage)


# GCP Build Cache Action

This task is designed to help you cache jobs or tasks completed to speed up your pipeline. It consumes outputs from the Affected Action to identify the project targets and their corresponding SHA revision. Additionally, it leverages the Pragma Action to handle scenarios where caching should be bypassed, such as when a pull request requires skipping the cache. `x__skip-cache=true` or `x__target-cache='skip'`

By using this Cache Action in conjunction with the Affected Action, you can significantly reduce build times and enhance the efficiency of your pipelines.


## Problems with doing this manually?

Here is a basic scaffold of how DIY caching might look like in a GitHub Action.

```yaml
    env:
      EXPECTED_GS_FILE: "gs://github-integration/mobile-android/${{inputs.CACHE_KEY}}"
    steps:
      - name: set up gcloud auth
        uses: 'google-github-actions/auth@v2'
        with:
          credentials_json: '${{ secrets.GCP_GITHUB_SERVICE_ACCOUNT_DEV }}'

      - name: set up gcloud cli with gsutil
        uses: 'google-github-actions/setup-gcloud@v2'

      - name: calculated variables
        shell: bash
        run: |
          if gsutil -D stat "$EXPECTED_GS_FILE"; then
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
          touch "file.txt" && gsutil -D cp "file.txt" $EXPECTED_GS_FILE
```

This sample shows that consideration is required in constructing your cache keys. You need to set environment variables for your cache-hit outputs and ensure the cache write step is placed at the end of the job. The more tasks and targets you want to cache within the same job, the more complex and code-intensive it becomes.

In a multi-job pipeline, this job would still need to be executed to determine if the expensive work should be skipped. If the cache-hits could be effeciently pre calculated upfront, the pipeline would be faster and shave minutes by pruning jobs that have a cache-hit and not needed.

Using the GCP Build Cache Action simplifies this process, efficiently handling caching in both single and multi-job pipelines, and reducing the amount of manual work required.


## Dependencies

This task depends on `gcloud` and `gsutil`. Ensure you have the Google Cloud SDK installed and authenticated in your runner.

Whenever you use `leblancmeneses/actions/apps/gcp-build-cache@main` in a job, you should include the following dependencies in your workflow:

```yaml
    - name: set up gcloud auth
      uses: 'google-github-actions/auth@v2'
      with:
        # choose your style: workload identity, or json file. @see: https://github.com/google-github-actions/auth
        credentials_json: '${{ secrets.GCP_GITHUB_SERVICE_ACCOUNT_DEV_FILE }}'

    - name: set up gcloud cli with gsutil
      uses: 'google-github-actions/setup-gcloud@v2'
```



## Single Job Pipeline Usage

See the [single job pipeline](./.github/workflows/ci.yml) in this repo that shows how we use the cache task internally.
By setting the optional `additional-keys`, we get additional keys projected to the cache object in the form of `<target>-<key>`.

```yaml
      # The following calculates the cache key, path, and hit status. It will not write to the cache.
      - name: calculate gcp cache
        id: cache
        uses: ./apps/gcp-build-cache
        with:
          affected: ${{steps.affected.outputs.affected}}
          pragma: ${{steps.pragma.outputs.pragma}}
          gcs-root-path: gs://opensource-github-integration/build-cache
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
      # The default is multi-job pipelines with write-on: 'post' which only writes on success of the entire job and can be placed anywhere in the job but after the gcp dependencies.
      - name: write pragma cache
        uses: ./apps/gcp-build-cache
        with:
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
      GCP_GITHUB_SERVICE_ACCOUNT: ${{secrets.GCP_GITHUB_SERVICE_ACCOUNT_DEV}}

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
      GCP_GITHUB_SERVICE_ACCOUNT: ${{secrets.GCP_GITHUB_SERVICE_ACCOUNT}}

```

```yaml
# .github/workflows/template.job.docker.yml
name: template.job.docker

on:
  workflow_call:
    secrets:
      GCP_GITHUB_SERVICE_ACCOUNT:
        description: "Required gcp iam service account to artifact registery and k8s"
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

      - name: set up gcloud auth
        uses: 'google-github-actions/auth@v2'
        with:
          credentials_json: '${{ secrets.GCP_GITHUB_SERVICE_ACCOUNT_DEV }}'

      - name: set up gcloud cli with gsutil
        uses: 'google-github-actions/setup-gcloud@v2'

      # can be put anywhere in the job but after the gcp dependencies.
      # cache will be written on success of the entire job.
      - name: write cache
        uses: leblancmeneses/actions/apps/gcp-build-cache@main
        with:
          cache_key_path: ${{fromJson(inputs.CACHE).path}}

      - name: apk generation for prod
        if:  |
          !failure() && !cancelled() && github.ref_name == 'prod' && fromJson(inputs.CACHE).cache-hit == false
        run: |
            ./gradlew bundleRelease --stacktrace
```
