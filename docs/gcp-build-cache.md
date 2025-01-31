- [GCP Build Cache Action](#gcp-build-cache-action)
  - [Dependencies](#dependencies)
  - [Usage](#usage)


# GCP Build Cache Action

This task is designed to help you cache jobs completed to speed up your build process in a multi-job pipeline. It consumes outputs from the Affected Action to key off the SHA version of the target. Additionally, it leverages the Pragma Action to handle scenarios where caching should be bypassed, such as when a pull request requires skipping the cache. `x__skip-cache=true` or `x__target-cache='skip'`

By using this Cache Action in conjunction with the Affected Action, you can significantly reduce build times and enhance the efficiency of your pipelines.


## Dependencies

This task depends on gcloud and gsutil. Ensure you have the Google Cloud SDK installed and authenticated in your runner.

```yaml
    - name: set up gcloud auth
      uses: 'google-github-actions/auth@v2'
      with:
        # choose your style: workload identity, or json file. @see: https://github.com/google-github-actions/auth
        credentials_json: '${{ secrets.GCP_GITHUB_SERVICE_ACCOUNT_DEV_FILE }}'

    - name: set up gcloud cli with gsutil
      uses: 'google-github-actions/setup-gcloud@v2'
```


## Usage

For single job pipelines, the Affected Action is sufficient to determine if a task should run.
For multi job pipelines see the scaffold of the real world sample in the [README.md](../README.md#recommendations-for-multi-job-pipeline).

Additional keys is only needed if you have a target that is split across multiple jobs and you want to cache each job separately.
This is useful for parallel jobs that build different parts of the same target.



```yaml
    ... task dependencies ...

    # The following calculates the cache key, path, and hit status. It will not write to the cache.
    - name: calculate gcp cache
      id: gcp-cache
      uses: leblancmeneses/actions/apps/gcp-build-cache@main
      with:
        affected: ${{steps.affected.outputs.affected}}
        pragma: ${{steps.pragma.outputs.pragma}}
        gcs-root-path: gs://abc-123-github/build-cache
        # additional-keys: |
        #   { "ui": ["lint", "build"], "api": [] }

    - name: example output
      if: fromJson(steps.gcp-cache.outputs.cache).target-ui.cache-hit == false
      run: |
        echo "cache: "
        echo '${{ steps.gcp-cache.outputs.cache }}' | jq .

    # The following writes to the cache only on `post` success of the job and can be placed anywhere in the job.
    - name: write cache
      uses: leblancmeneses/actions/apps/gcp-build-cache@main
      with:
        CACHE_KEY_PATH: ${{fromJson(steps.gcp-cache.outputs.cache).target-ui.path}}

```

Given this task is designed to be used in a multi-job pipeline, the individual job template will receive a reference to the target cache.

```yaml
# .github/workflows/build.yml

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


# .github/workflows/template.job.[android|ios|docker].yml
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
    runs-on: ${{ inputs.RUNNER }}
    steps:
      - name: checkout code
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: apk generation for prod
        if:  |
          !failure() && !cancelled() && github.ref_name == 'prod' && fromJson(inputs.CACHE).cache-hit == false
        run: |
            ./gradlew bundleRelease --stacktrace

      ... task dependencies ...

      - name: write cache
        uses: leblancmeneses/actions/apps/gcp-build-cache@main
        with:
          CACHE_KEY_PATH: ${{fromJson(inputs.CACHE).path}}
```
