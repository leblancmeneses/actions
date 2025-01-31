![GitHub Actions](./docs/graphics/repository-open-graph-template.png)

- [Actions](#actions)
  - [Version Autopilot Action](#version-autopilot-action)
  - [Pragma Action](#pragma-action)
  - [Affected Action](#affected-action)
  - [GCP Build Cache Action](#gcp-build-cache-action)
- [Recommendations for multi-job pipeline](#recommendations-for-multi-job-pipeline)
- [Run locally](#run-locally)
- [Contributing](#contributing)
- [Need Help?](#need-help)
- [License](#license)

# Actions

## Version Autopilot Action

This is perfect for packages that are not meant to be **consumed** by other packages, like a website or a mobile app,
where semantic versioning is not required and is continuously deployed.

This will automatically increment the version on every **run** of your github action pipeline.

[Documentation](docs/version-autopilot.md)

## Pragma Action

This GitHub Action allows pull requests to change behavior allowing builds to accept `[skip,deploy,force]` style flags.

[Documentation](docs/pragma.md)

## Affected Action

Have a polyglot build system? This task is for you. This task is designed for projects in mono repos that are not *fully* covered by a single build tool similar to Make, Bazel, or Nx. It helps track the dependency graph and streamline your pipeline by identifying and executing only the steps impacted by recent changes.

[Documentation](docs/affected.md)

## GCP Build Cache Action

This task is designed to help you cache jobs completed to speed up your build process in a multi-job pipeline. It consumes outputs from the Affected Action to key off the SHA version of the target. Additionally, it leverages the Pragma Action to handle scenarios where caching should be bypassed, such as when a pull request requires skipping the cache. `x__skip-cache=true` or `x__target-cache='skip'`

By using this Cache Action in conjunction with the Affected Action, you can significantly reduce build times and enhance the efficiency of your pipelines.
For single job pipelines, the Affected Action is sufficient to determine if a task should run.

[Documentation](docs/gcp-build-cache.md)


# Recommendations for multi-job pipeline

A [single job pipeline](https://github.com/leblancmeneses/actions/blob/main/.github/workflows/ci.yml) is a great starting point for CI/CD workflows.
Start here if you are new to GitHub Actions or have a simple project.

As your project evolves, you may need to divide your pipeline into multiple jobs to enhance speed (parallel jobs), maintainability, and accommodate different operating systems for various tools.

Create an init job to calculate variables needed across multiple jobs. This will avoid redundant checkouts and calculations across each job.

Generate an template.job.init.yml file with the following content:

```yaml
name: template.job.init

on:
  workflow_call:
    outputs:
      affected:
        value: ${{ jobs.init.outputs.affected }}
      pragma:
        value: ${{ jobs.init.outputs.pragma }}
      cache:
        value: ${{ jobs.init.outputs.cache }}
      version-autopilot:
        value: ${{ jobs.init.outputs.version-autopilot }}

jobs:
  init:
    runs-on: ubuntu-latest
    outputs:
      affected: ${{steps.affected.outputs.affected}}
      pragma: ${{steps.pragma.outputs.pragma}}
      cache: ${{steps.cache.outputs.cache}}
      version-autopilot: ${{steps.version-autopilot.outputs.version_autopilot}}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: calculate pragma outputs
        id: pragma
        uses: leblancmeneses/actions/apps/pragma@main
        with:
          variables: |
            skip-cache=false

      - name: calculate affected
        id: affected
        uses: leblancmeneses/actions/apps/affected@main
        with:
          # recommended-imagetags-registry: "${{ env.IMAGE_REGISTERY_PATH }}/${{ env.GCP_PROJECT_ID }}/${{ github.event_name == 'pull_request' && github.event.pull_request.base.ref || github.ref_name }}/"
          changed-files-output-file: .artifacts/affected.json
          rules-file: .github/affected.rules
          recommended-imagetags-tag-format: '{target}{sha}'
          recommended-imagetags-tag-format-whenchanged: ${{ github.event_name == 'pull_request' && format('pr-{0}-{1}', github.event.number, '{sha|10}') || '{sha}' }}

      - name: gcp cache
        id: cache
        uses: leblancmeneses/actions/apps/gcp-build-cache@main
        with:
          affected: steps.affected.outputs.affected
          pragma: steps.pragma.outputs.pragma
          gcs-root-path: gs://xxx-my-github-integration/build-cache
          additional-keys: |
            { "project-ui": ["lint", "build", "e2e"], "project-api": [] }

      - name: upload affected output
        uses: actions/upload-artifact@v4
        with:
          name: affected
          if-no-files-found: ignore
          retention-days: 1
          path: .artifacts/**
          include-hidden-files: true

      - name: calculate version-autopilot outputs
        id: version-autopilot
        uses: leblancmeneses/actions/apps/version-autopilot@main
        with:
          major: 0
          minor: 0
          shift: 0

      # Add more steps or calculations here to validate run.
      # ...

```

```yaml
name: build

on:
  push:
    # ...
  pull_request:
    # ...
  workflow_dispatch:
    # ...

jobs:
  vars:
    uses: ./.github/workflows/template.job.init.yml

  show-output:
    needs: [vars]
    runs-on: ubuntu-latest
    steps:
      - name: checkout code
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: download affected
        uses: actions/download-artifact@v4
        with:
          name: affected
          path: .artifacts/

      - name: example output
        run: |
          echo "affected: "
          echo '${{ needs.vars.outputs.affected }}' | jq .
          echo "pragma: "
          echo '${{ needs.vars.outputs.pragma }}' | jq .
          echo "version-autopilot: "
          echo '${{ needs.vars.outputs.version-autopilot }}' | jq .
          echo "cache: "
          echo '${{ needs.vars.outputs.cache }}' | jq .

          cat ./.artifacts/affected.json
          for file in $(jq -r '.[] | .file' ./.artifacts/affected.json); do
            echo "processing: $file"
          done

  # # Example of reusable job workflows that leverage affected, cache, and pragma outputs.
  # build-api:
  #   needs: [vars]
  #   uses: ./.github/workflows/template.job.build.yml
  #   if: |
  #     !failure() && !cancelled() && (
  #       inputs.MANUAL_FORCE_BUILD == 'true' || (
  #         fromJson(needs.vars.outputs.affected).build-api.changes == true &&
  #         fromJson(needs.vars.outputs.cache).build-api.cache-hit == false
  #       )
  #     )
  #   with:
  #     CACHE: ${{toJson(fromJson(needs.vars.outputs.cache).build-api)}}
  #     DOCKER_FILE: "./build-api/Dockerfile"
  #     DOCKER_BUILD_ARGS: "IS_PULL_REQUEST=${{github.event_name == 'pull_request'}}"
  #     DOCKER_CONTEXT: "./build-api"
  #     DOCKER_LABELS: ${{needs.vars.outputs.IMAGE_LABELS}}
  #     DOCKER_IMAGE_TAGS: ${{ fromJson(needs.vars.outputs.affected).build-api.recommended_imagetags &&
  #          toJson(fromJson(needs.vars.outputs.affected).build-api.recommended_imagetags) || '[]' }}
  #     version_offsets: '{"MAJOR":5, "MINOR": 1, "SHIFT": 0}'
  #   secrets:
  #     GCP_GITHUB_SERVICE_ACCOUNT: ${{secrets.GCP_GITHUB_SERVICE_ACCOUNT}}
```

We recommend locking the `uses:` clause to a specific tag or sha to avoid pipeline
breakage due to future changes in the action.

```yaml
uses: leblancmeneses/actions/apps/<taskname>@main # latest (only if you are okay with breakage)
uses: leblancmeneses/actions/apps/<taskname>@v1.1.1 # specific tag
uses: leblancmeneses/actions/apps/<taskname>@commit-sha # specific sha
```

# Run locally

```bash
nvm use
pnpm i
pnpm nx run-many --target=test --parallel
```

# Contributing
Contributions are welcome! Please open an issue or submit a pull request if you have suggestions or improvements.


# Need Help?

Large language models (LLMs) cannot solve your organization's people problems. If your software teams are struggling and falling behind, consider engaging an actual human expert who can identify product and development issues and provide solutions.

Common areas where we can assist include DSL development, continuous delivery, cloud migrations, Kubernetes cluster cost optimizations, GitHub Actions and GitHub Codespaces.

Contact us at [improvingstartups.com](https://improvingstartups.com).


# License
This project is licensed under the [MIT License](LICENSE).