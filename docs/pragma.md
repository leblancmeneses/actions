- [Pragma Action](#pragma-action)
  - [Features](#features)
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Pull Request Override Usage](#pull-request-override-usage)
  - [Merged Result](#merged-result)
  - [Consuming the JSON object](#consuming-the-json-object)
  - [Sample real world usage](#sample-real-world-usage)

# Pragma Action

This GitHub Action allows pull requests to change behavior allowing builds to accept `[skip,force]` flags.
This will allow you to skip cache and other tasks in your pipeline if configured.

## Features
- **Pull Request Overrides**: Extracts variables from pull request descriptions using a specific pattern (`x__key=value`).
- **Key Standardization**: Ensures all keys are converted to uppercase to avoid case-sensitivity issues.
- **Merged Configuration**: Combines default variables with overrides, giving precedence to pull request variables.
- **Flexible Value Types**: Automatically converts values to appropriate types (`boolean`, `number`, or `string`).

## Inputs

| Name       | Required | Description                                                  |
|------------|----------|--------------------------------------------------------------|
| `variables`| Yes      | A string containing INI-formatted variables as default values. |

## Outputs

| Name    | Description                                      |
|---------|--------------------------------------------------|
| `pragma`| A JSON object containing the merged configuration variables. |

## Pull Request Override Usage

Developers can override default variables by adding variables prefixed with `x__` to the pull request description.
These variables will take precedence over the defaults specified in the variables input. For example:

```yaml
      - name: calculate pragma
        id: pragma
        uses: leblancmeneses/actions/apps/pragma@main
        with:
          variables: | # INI format to initialize default variables
            lint-appname-ui = ''
            force = false
            deploy = "${{ github.ref == 'refs/heads/dev' || github.ref == 'refs/heads/prod' }}"

```

Pull request description:

```
PR description

...

x__lint-appname-ui=skip
```

## Merged Result

The final merged output for this example would be:

```json
{
  "LINT-APPNAME-UI": "skip",
  "FORCE": false,
  "DEPLOY": false
}
```

## Consuming the JSON object

This will override the `LINT-APPNAME-UI` variable to skip the linting step.

```yaml
      - name: lint appname-ui
        if: ${{ !failure() && !cancelled() && fromJson(steps.pragma.outputs.pragma).LINT-APPNAME-UI != 'skip' }}
        run: npm run lint:appname-ui
```

## Sample real world usage

See `fromJson(needs.vars.outputs.pragma).E2E != 'skip'` in the following example:

```yaml
  e2e:
    needs: [vars, build-ui, build-api, build-dbmigration, build-mysqlext]
    uses: ./.github/workflows/template.job.e2e.yml
    if: |
      !failure() && !cancelled() && github.event_name == 'pull_request' &&
        fromJson(needs.vars.outputs.affected).e2e.changes &&
        fromJson(needs.vars.outputs.cache).e2e.cache-hit == false &&
        fromJson(needs.vars.outputs.pragma).E2E != 'skip' &&
        needs.build-ui.result != 'failure' &&
        needs.build-api.result != 'failure' &&
        needs.build-dbmigration.result != 'failure' &&
        needs.build-mysqlext.result != 'failure'
    with:
      CACHE: ${{toJson(fromJson(needs.vars.outputs.cache).e2e)}}
      APP_NAME: 'myapp'
      CLUSTER_NAME: ${{needs.vars.outputs.CLUSTER_NAME}}
      API_IMAGE: ${{fromJson(needs.vars.outputs.affected).api.recommended_imagetags[0]}}
      UI_IMAGE: ${{fromJson(needs.vars.outputs.affected).ui.recommended_imagetags[0]}}
      DBMIGRATION_IMAGE: ${{fromJson(needs.vars.outputs.affected).dbmigration.recommended_imagetags[0]}}
      MYSQLEXT_IMAGE: ${{fromJson(needs.vars.outputs.affected).mysqlext.recommended_imagetags[0]}}
    secrets:
      GCP_GITHUB_SERVICE_ACCOUNT: ${{secrets.GCP_GITHUB_SERVICE_ACCOUNT_DEV}}
```