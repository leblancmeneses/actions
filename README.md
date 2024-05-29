# Actions

## Version Autopilot

This is perfect for packages that are not meant to be **consumed** by other packages, like a website or a mobile app,
where semantic versioning is not required and is continuously deployed.

This will automatically increment the version on every **run** of your github action pipeline.


```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v4

  - name: example in README.md task
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

If you are looking for semantic versioning research [release pipeline](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and git tags.


## Need help with your continuous delivery or k8s clusters?

Large language models (LLMs) cannot solve your organization's people problems.
If your software teams need help and are falling behind, consider an actual human
who can spot and help steer the ship away from danger.

Contact us at [improvingstartups.com](https://improvingstartups.com).