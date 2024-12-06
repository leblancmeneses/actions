
- [Actions](#actions)
  - [Affected](#affected)
    - [Rule DSL](#rule-dsl)
      - [Rule Key Examples](#rule-key-examples)
      - [Composing Rules](#composing-rules)
      - [Exclusion Expression](#exclusion-expression)
      - [Wrapping up example](#wrapping-up-example)
  - [Version Autopilot](#version-autopilot)
    - [Example usages](#example-usages)
  - [Run locally:](#run-locally)
  - [Publish dist version:](#publish-dist-version)
  - [Need Help?](#need-help)

# Actions

## Affected

This task generates 3 JSON objects to streamline your pipeline by skipping unnecessary steps and running only those affected by `affected_changes`. It also aligns git commits with images via `affected_imagetags` and `affected_shas`, simplifying GitOps strategies.


```
jobs:
  init:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: calculate affected
        id: affected
        uses: leblancmeneses/actions/dist/apps/affected@main
        with:
          rules: |
            <project-ui>: 'project-ui/**';
            <project-api>: 'project-api/**';
            [project-dbmigrations](./databases/project): './databases/project/**';
            project-e2e: project-ui project-api project-dbmigrations !'**/*.md';
```
### Rule DSL

These rules map a *project name*, its *directory*, and the *expression* to check for changes.

* The left side of the colon `:` is the **rule key**, while the right side specifies the expression to match files.
* **Rule keys with brackets** `[]` or `<>` will appear in the JSON object under `affected_imagetags` or `affected_shas`, and `affected_changes`.
* **Rule keys without brackets** will only appear in `affected_changes` but **not** in `affected_imagetags` or `affected_shas`.

#### Rule Key Examples

1. **Short Form**: `<project-ui>` The image name is `project-ui`, and the project directory is `project-ui`.
2. **Long Form**: `[project-dbmigrations](./databases/project)` The image name is `project-dbmigrations`, and the project directory is `./databases/project`.

#### Composing Rules

The `project-e2e` rule includes `project-ui`, `project-api`, and `project-dbmigrations`. This allows referencing prior expressions and combining them using `OR` operator.
For example, **e2e** runs if files change in any of these projects but not for markdown-only changes.

#### Exclusion Expression

The `!` operator excludes files or directories.

* For example, `**/*.md` excludes all markdown files.
* Glob expressions use [picomatch](https://github.com/micromatch/picomatch) for matching.

This structure provides flexibility and reusability for defining change-based rules across projects.

#### Wrapping up example

Assuming a change list containing:

```json
[
  "project-ui/file1.js",
  "project-api/readme.md",
]
```

The `affected` action will generate the following JSON objects:

```json
{
  "affected_changes": {
    "project-api": true,
    "project-ui": true,
    "project-dbmigrations": false,
    "project-e2e": false
  },
  "affected_imagetags": {
    "project-ui": "project-ui:dev-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    "project-api": "project-api:dev-dd65064e5d3e4b0a21b867fa02561e37b2cf7f01",
    "project-dbmigrations": "project-dbmigrations:dev-7b367954a3ca29a02e2b570112d85718e56429c9"
  },
  "affected_shas": {
    "project-ui": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    "project-api": "dd65064e5d3e4b0a21b867fa02561e37b2cf7f01",
    "project-dbmigrations": "7b367954a3ca29a02e2b570112d85718e56429c9"
  }
}
```


## Version Autopilot

This is perfect for packages that are not meant to be **consumed** by other packages, like a website or a mobile app,
where semantic versioning is not required and is continuously deployed.

This will automatically increment the version on every **run** of your github action pipeline.


```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v4

  - name: calculate version autopilot
    id: version-autopilot
    uses: leblancmeneses/actions/dist/apps/version-autopilot@main
    with:
      major: 0
      minor: 0
      shift: 50 # remove if this is a brand new application. Otherwise, use this to match your current version.

  - name: example in README.md output
    run: |
      echo "github.run_number: ${{ github.run_number }}"

      # useful for container image and package names
      echo "version_autopilot_string_recommended: ${{ steps.version-autopilot.outputs.version_autopilot_string_recommended }}"

      # base to derive your own versioning naming scheme
      echo "version_autopilot_string: ${{ steps.version-autopilot.outputs.version_autopilot_string }}"

      # android and ios version codes
      echo "version_autopilot_code: ${{ steps.version-autopilot.outputs.version_autopilot_code }}"
```

![exampe output](./.github/example-output.png)

If you have an existing application you can modify the `major`.`minor` and `shift` inputs to match the current version of your application.
See our [.github/workflows/tests.version-autopilot.yml](.github/workflows/tests.version-autopilot.yml) for how rollover works. We leverage `${{github.run_number}}` internally to increment the version.

If you are looking for semantic versioning research `git tags` and [release pipelines](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).


### Example usages

1. For Docker image tagging

```yaml
  - name: myapp containerize and push
    uses: docker/build-push-action@v5
    with:
      platforms: linux/amd64
      push: true
      tags: ${{ env.ARTIFACT_REGISTRY }}/myapp:${{ steps.version-autopilot.outputs.version_autopilot_string_recommended }}
      context: ./apps/myapp
      file: ./apps/myapp/Dockerfile-myapp
```

2. For Android APK generation:

```yaml
  - name: apk generation for PR
    if: github.event_name == 'pull_request'
    run: bash ./gradlew assembleDebug --stacktrace
    env:
      APP_VERSION_CODE: ${{ steps.version-autopilot.outputs.version_autopilot_code }}
      APP_VERSION_STRING: ${{ steps.version-autopilot.outputs.version_autopilot_string_recommended }}
      BASE_URL: https://xyz-${{github.event.number}}-api.<project>.nobackend.io/
```

3. For IOS IPA build

```yaml

  - name: archive and export IPA
    run: |
      xcodebuild \
        -workspace MyApp.xcworkspace \
        -scheme MyApp \
        -configuration Release \
        -destination 'generic/platform=iOS' \
        CURRENT_PROJECT_VERSION=${{ steps.version-autopilot.outputs.version_autopilot_code }} \
        MARKETING_VERSION=${{ steps.version-autopilot.outputs.version_autopilot_string }} \
        PROVISIONING_PROFILE_SPECIFIER=${{ github.ref_name == 'prod' && 'distribution-profile' || 'adhoc-profile' }} \
        -archivePath ./build/MyApp.xcarchive \
        archive | xcpretty --simple --color
      ....
```

4. For a chrome extension:

```yaml
  - name: update manifest version
    run: |
      manifest=tabsift/extension/manifest.json
      jq --arg version "${{ steps.version-autopilot.outputs.version_autopilot_string }}" '.version = $version' $manifest > tmp.json && mv tmp.json $manifest
```

## Run locally:

```bash
nvm use
pnpm i
npx nx run e2e:e2e
```

## Publish dist version:

```bash
pnpm exec nx run affected:build:production
pnpm exec nx run version-autopilot:build:production
```

## Need Help?

Large language models (LLMs) cannot solve your organization's people problems. If your software teams are struggling and falling behind, consider engaging an actual human expert who can identify product and development issues and provide solutions.

Common areas where we can assist include DSL development, continuous delivery, cloud migrations, Kubernetes cluster cost optimizations, GitHub Actions and GitHub Codespaces.

Contact us at [improvingstartups.com](https://improvingstartups.com).