# Actions

## Version Autopilot

This is perfect for packages that are not meant to be consumed by other packages, like a website or a mobile app,
where semantic versioning is not required.

This will automatically increment the version on every "run" of your github action pipeline.

Example of where we use this publicly: [k8s packages](https://console.cloud.google.com/artifacts/docker/wwwrobusthavencom/us-central1/public-dev?project=wwwrobusthavencom)


```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v4

  - id: version-autopilot
    uses: leblancmeneses/actions/dist/apps/version-autopilot@main
    with:
      major: 0
      minor: 0
      shift: 50 # remove if this is a brand new application. Otherwise, use this to match your current version.

  - name: echo output
    run: |
      echo "version_autopilot_string_recommended: ${{ steps.version-autopilot.outputs.version_autopilot_string_recommended }}"
      echo "version_autopilot_string: ${{ steps.version-autopilot.outputs.version_autopilot_string }}"
      echo "version_autopilot_code: ${{ steps.version-autopilot.outputs.version_autopilot_code }}"
```

If you have an existing application you can modify the `major`.`minor` and `shift` inputs to match the current version of your application.
See our [.github/workflows/tests.version-autopilot.yml](.github/workflows/tests.version-autopilot.yml) for how rollover works. We leverage `${{github.run_number}}` internally to increment the version.

If you are looking for semantic versioning use a [release pipeline](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).


## Need help with your continuous delivery or k8s clusters?

We can help you with that. Contact us at [improvingstartups.com](https://improvingstartups.com) for more information.
