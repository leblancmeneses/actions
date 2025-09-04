- [Version Autopilot Action](#version-autopilot-action)
  - [Tips:](#tips)
  - [Sample real world usage](#sample-real-world-usage)

# Version Autopilot Action

This is perfect for packages that are not meant to be **consumed** by other packages, like a website or a mobile app,
where semantic versioning is not required and is continuously deployed.

This will automatically increment the version on every **run** of your github action pipeline.


```yaml
  - name: calculate version autopilot
    id: version-autopilot
    uses: leblancmeneses/actions/apps/version-autopilot@main
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

      # json object with all fields
      echo '${{ steps.version-autopilot.outputs.version_autopilot }}' | jq .

```

![exampe output](../.github/example-output.png)

If you have an existing application you can modify the `major`.`minor` and `shift` inputs to match the current version of your application.
See our [.github/workflows/tests.version-autopilot.yml](.github/workflows/tests.version-autopilot.yml) for how rollover works. We leverage `${{github.run_number}}` internally to increment the version.

If you are looking for semantic versioning research `git tags` and [release pipelines](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).


## Tips:

This task should be placed in the pipeline job that builds the binary. If you have a single job pipeline, the above configuration is sufficient. However, if you have multiple jobs, place this task in the job that builds the binary. The `version_offsets` input allows each instance of the template to adjust the version independently.

```yaml
# ./.github/workflows/template.job.npm-pkg.yml
      - id: version-autopilot
        uses: leblancmeneses/actions/apps/version-autopilot@main
        with:
          major: ${{ fromJson(inputs.version_offsets).MAJOR }}
          minor: ${{ fromJson(inputs.version_offsets).MINOR }}
          shift: ${{ fromJson(inputs.version_offsets).SHIFT }}
```


```yaml
# ./.github/workflows/build.yml
  rhngx:
    needs: [vars]
    if: >
      !failure() && !cancelled() && fromJson(needs.vars.outputs.affected).rhngx.changes
    uses: ./.github/workflows/template.job.npm-pkg.yml
    with:
      app_name: 'rhngx'
      app_directory: ./nx-workspace
      version_offsets: '{"MAJOR":0, "MINOR": 1, "SHIFT": 0}'
    secrets:
      GCP_GITHUB_SERVICE_ACCOUNT: ${{ github.ref_name == 'prod' && secrets.PRODUCTION_GCP_GITHUB_SERVICE_ACCOUNT|| secrets.STAGING_GCP_GITHUB_SERVICE_ACCOUNT }}
```



## Sample real world usage

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