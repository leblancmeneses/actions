- [Affected Action](#affected-action)
  - [Key Features](#key-features)
  - [Recommendations:](#recommendations)
  - [Rule DSL](#rule-dsl)
    - [Composing Rules](#composing-rules)
    - [Literal Expression](#literal-expression)
    - [Regex Expression](#regex-expression)
    - [Suffix for Literal and Regex Expressions](#suffix-for-literal-and-regex-expressions)
      - [Usage with Literal Expressions:](#usage-with-literal-expressions)
      - [Usage with Regular Expressions:](#usage-with-regular-expressions)
      - [Key Notes:](#key-notes)
    - [Negate Expression](#negate-expression)
    - [Except Expression](#except-expression)
    - [Wrapping up example](#wrapping-up-example)
  - [Consuming the JSON object](#consuming-the-json-object)
  - [Real world usage](#real-world-usage)
  - [Run locally for Husky integration](#run-locally-for-husky-integration)
    - [Benefits of This Approach](#benefits-of-this-approach)


# Affected Action

This task is designed for projects in mono repos that are not *fully* covered by build tools similar to Make, Bazel, or Nx. It helps track the dependency graph and streamline your pipeline by identifying and executing only the steps impacted by recent changes.


## Key Features

* **Dependency Graph Optimization:** Generates a JSON object to identify dependencies impacted by `changes`, allowing you to skip unnecessary steps and focus only on what needs to be executed.
* **Commit Alignment:** Aligns Git commits with images using `recommended_imagetags` and `shas`. These hashes represent the state of the dependency graph, based on defined rules, ensuring consistency across your workflow.

## Recommendations:

* Use `changes` for pull requests to detect and act upon specific updates.
* Use `shas` for core branches like `main`, `develop`, and `prod` as a key for caching purposes, improving build efficiency.

This approach helps optimize pipelines, reduce execution time, and maintain reliable caching across your development workflow.

```yaml
jobs:
  init:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # fetch all history for accurate change detection
          # If you have multi-job workflow add affected task to an init step to avoid redundant checkouts.
          # If you are using path triggers the diff is limited to 300 files.
          # @see: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#git-diff-comparisons
          # With this task you can get all the changes.

      - name: calculate affected
        id: affected
        uses: leblancmeneses/actions/apps/affected@main
        with:
          verbose: false # optional
          recommended-imagetags-tag-format: '{sha}' # optional
          recommended-imagetags-tag-format-whenchanged: ${{ github.event_name == 'pull_request' && format('pr-{0}-{1}', github.event.number, '{sha:10}') || '{sha}' }} # optional to add prefix, suffix to the image tag.
          recommended-imagetags-registry: '' # optional; used in recommended_imagetags.
          changed-files-output-file: '' # optional; The path to write the file containing the list of changed files.
          rules-file: '' # optional; The path to the file containing the rules if you perfer externalizing the rules for husky integration.
          rules: |
            peggy-parser: 'apps/affected/src/parser.peggy';
            peggy-parser-checkIf-incomplete: peggy-parser AND (!'apps/affected/src/parser.ts' OR !'apps/affected/src/parser.spec.ts');
              # peggy was updated but not the generated parser file or its tests.

            markdown: '**/*.md';

            third-party-deprecated: 'libs/third-party-deprecated/**';
            ui-core: 'libs/ui-core/**';
            ui-libs: ui-core third-party-deprecated;

            <project-ui>: ui-libs 'project-ui/**' EXCEPT (markdown '**/*.spec.ts');
            <project-api>: 'project-api/**' EXCEPT ('**/README.md');
            <project-dbmigrations>: './databases/project/**';

```
## Rule DSL

These rules map a *project name* and the *expression* to check for changes and to generate an sha1 hash of the dependency graph.

* The left side of the colon `:` is the **rule key**, while the right side specifies the **expression** to match files.
* **Rule keys with brackets** `<>` will appear in the JSON object under `recommended_imagetags` or `shas`, and `changes`.
* **Rule keys without brackets** will only appear in `changes` but **not** in `recommended_imagetags` or `shas`.
* Glob expressions use [picomatch](https://github.com/micromatch/picomatch) for matching.


### Composing Rules

The `project-ui` rule is composed of `ui-libs` and `project-ui's definition`, enabling you to reference and combine multiple expressions. For example, `project-ui` runs when files change in any of these projects but excludes runs triggered by markdown or test only changes.

Expressions can combine multiple conditions using `AND` or `OR` operators. If no operator is specified, `OR` is used by default.

### Literal Expression

Literal expressions are string-based and can be enclosed in single or double quotes. For example:

* `'file.ts'` OR `"file.ts"`

By default, literal expressions are case-sensitive. To make them case-insensitive, append the `i` flag:

* Example: `"readme.md"i` will match `README.md`, `readme.md`, or `rEaDme.mD`.

### Regex Expression

Regex expressions allow for more flexible matching and are defined using the standard JavaScript regex syntax. For example:

* `/readme\.md/i`

This regex will match `README.md`, `readme.md`, or `rEaDme.mD`. Internally, the expression is converted to a JavaScript RegExp object, ensuring full compatibility with JavaScript’s native regex functionality.


### Suffix for Literal and Regex Expressions

By default, all expressions match files regardless of their Git status code. However, you can add a suffix to the expression to filter matches based on specific Git status codes.
The suffixes are `A` for added, `M` for modified, `D` for deleted, `R` for renamed, `C` for copied, `U` for unmerged, `T` for typechange, `X` for unknown, `B` for broken.

#### Usage with Literal Expressions:
* **Default behavior:** `'file.ts'` matches files with any Git status code.
* **With status suffix:** `'file.ts':M` matches only files with the "modified" status.
* **Case-insensitive matching:** `'file.ts'i:A` matches "added" files, ignoring case.

#### Usage with Regular Expressions:
* **Default behavior:** `/readme\.md/` matches files with any Git status code.
* **With status suffix:** `/readme\.md/:M` matches only "modified" files.
* **Case-insensitive matching:** `/readme\.md/i:A` matches "added" files, ignoring case.

#### Key Notes:
1. **Suffix Syntax:** Add a colon : followed by the desired status code to filter matches.
2. **Case Insensitivity:** Use the i flag before the colon to make the match case-insensitive.


### Negate Expression

The `!` operator is used to exclude specific files or directories from matching criteria. This ensures that certain files or directories are not modified in a pull request.

* **Example:** `!'dir/file.js'` ensures that changes to `dir/file.js` are not allowed in a pull request.


### Except Expression

The `EXCEPT` operator removes files or directories from the expression.

```yaml
  markdown: '**/*.md';
  <project-ui>: 'project-ui/**' EXCEPT (markdown '**/*.spec.ts');
```


### Wrapping up example

Assuming a changelist contains the following files:

```json
[
  "project-ui/file1.js",
  "project-api/README.md",
]
```

The `affected` action will generate the following JSON objects:

```json
{
  "peggy-parser": {
    "changes": false
  },
  "peggy-parser-checkIf-incomplete": {
    "changes": false
  },
  "markdown": {
    "changes": true
  },
  "project-api": {
    "changes": false,
    "shas": "dd65064e5d3e4b0a21b867fa02561e37b2cf7f01",
    "recommended_imagetags": [
      "project-api:dd65064e5d3e4b0a21b867fa02561e37b2cf7f01",
      "project-api:pr-6"
    ]
  },
  "project-ui": {
    "changes": true,
    "shas": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    "recommended_imagetags": [
      "project-ui:38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      "project-ui:pr-6"
    ]
  },
  "project-dbmigrations": {
    "changes": false,
    "shas": "7b367954a3ca29a02e2b570112d85718e56429c9",
    "recommended_imagetags": [
      "project-dbmigrations:7b367954a3ca29a02e2b570112d85718e56429c9"
    ]
  },
  "third-party-deprecated": {
    "changes": false
  },
  "ui-core": {
    "changes": false
  },
  "ui-libs": {
    "changes": false
  }
}
```

## Consuming the JSON object

```yaml
      - name: example affected output
        run: |
          echo "affected: "
          echo '${{ steps.affected.outputs.affected }}' | jq .

          # You can use env values for naming complex expressions.
          HAS_CHANGED_PROJECT_UI=$(echo '${{ steps.affected.outputs.affected }}' | jq -r '.["project-ui"].changes')
          echo "HAS_CHANGED_PROJECT_UI=$HAS_CHANGED_PROJECT_UI" >> $GITHUB_ENV

      - name: ui tests
        if: ${{ !failure() && !cancelled() && fromJson(steps.affected.outputs.affected).project-ui.changes }}
        run: npx nx run project-ui:test
```

## Real world usage

```yaml

jobs:
  vars:
    uses: ./.github/workflows/template.job.init.yml
    secrets:
      GCP_GITHUB_SERVICE_ACCOUNT: ${{secrets.GCP_GITHUB_SERVICE_ACCOUNT}}

  build-api:
    needs: [vars]
    uses: ./.github/workflows/template.job.build.yml
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
    secrets:
      GCP_GITHUB_SERVICE_ACCOUNT: ${{secrets.GCP_GITHUB_SERVICE_ACCOUNT}}

  # ...
```

## Run locally for Husky integration

After installing [Husky](https://typicode.github.io/husky/) in your project, you can integrate the `affected` action.

### Benefits of This Approach

* **Speed:** Only runs checks on changed files, making pre-commit hooks faster.
* **Efficiency:** Avoids running checks on the entire codebase unnecessarily.
* **Automation:** Automatically adds fixed files back to the staging area, streamlining the commit process.

Our rule-based approach standardizes the process to identify which targets have changed, making it adaptable to diverse tech stacks and monorepo structures.

[See Husky Example](./.husky/pre-commit).

```bash
# runs cli version of the tool
# https://hub.docker.com/repository/docker/leblancmeneses/actions-affected/general
docker run --rm -v ./:/app -w /app leblancmeneses/actions-affected:v3.0.4-60aac9c calculate --rules-file ./.github/affected.rules > affected.json
```
