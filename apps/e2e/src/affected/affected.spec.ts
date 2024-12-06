// jobs:
//   init:
//     runs-on: ubuntu-latest
//     steps:
//       - name: Checkout code
//         uses: actions/checkout@v4
//         with:
//           fetch-depth: 0

//       - name: example actions
//         id: affected
//         uses: leblancmeneses/actions/dist/apps/affected@main
//         with:
//           rules: |
//             <project-ui>: 'project-ui/**';
//             <project-api>: 'project-api/**';
//             [project-dbmigrations](./databases/project): 'project-api/**';
//             project-e2e: project-ui project-api !'**/*.md';

jest.mock("@actions/core");
jest.mock("@actions/github");
/* eslint-disable @nx/enforce-module-boundaries */
import * as affectedMain from "@affected/main"; // Import everything
import { run } from "@affected/main";
import * as core from "@actions/core";


describe("affected", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should parse valid YAML and set outputs", async () => {
    // Arrange
    const mockSetFailed = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn());

    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <project-ui>: 'project-ui/**';
          <project-api>: 'project-api/**';
          [project-dbmigrations](./databases/project): './databases/project/**';
          project-e2e: 'e2e/**' project-ui project-api project-dbmigrations !'**/*.md';
        `;
      return "";
    });

    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    jest.spyOn(affectedMain, "getCommitHash").mockImplementation((path: string, hasChanges: boolean) => `sha-${path}-${hasChanges}`);
    jest.spyOn(affectedMain, "getDevOrProdPrefixImageName").mockImplementation((hasChanges: boolean, commitSha: string, appTarget: string, path: string) => `image-${appTarget}-${hasChanges}`);
    jest.spyOn(affectedMain, "getChangedFiles").mockResolvedValue([
      "project-ui/file1.js",
      "project-api/readme.md",
    ]);

    // Act
    await run();

    // Assert
    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(core.getInput).toHaveBeenCalledWith("rules", {
      required: true,
    });

    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {"project-api": true, "project-dbmigrations": false, "project-e2e": true, "project-ui": true});
    expect(core.setOutput).toHaveBeenCalledWith("affected_imagetags", {
      'project-api': 'image-project-api-true',
      "project-dbmigrations": "image-project-dbmigrations-false",
      'project-ui': 'image-project-ui-true',
    });
    expect(core.setOutput).toHaveBeenCalledWith("affected_shas", {
      'project-api': 'sha-project-api-true',
      "project-dbmigrations": "sha-./databases/project-false",
      'project-ui': 'sha-project-ui-true',
    });
    expect(core.info).toHaveBeenCalled();
  });
});
