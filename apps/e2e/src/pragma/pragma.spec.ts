// jobs:
//   init:
//     runs-on: ubuntu-latest
//     steps:
//       - name: Checkout code
//         uses: actions/checkout@v4

//       - name: pragma action
//         id: pragma
//         uses: leblancmeneses/actions/dist/apps/pragma@main
//         with:
//           variables: |
//             var1=test
//             var2=${{ github.event.pull_request.base.ref || github.ref_name }}
import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from '@pragma/main';

jest.mock('@actions/core');
jest.mock('@actions/github');


describe('pragma action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete github.context.eventName;
    delete github.context.payload;
    delete process.env.PR_BODY;
  });

  test('should parse valid YAML and set outputs', async () => {
    // Arrange
    const mockInput = `
      var1=test
      var2=42
      var3=true
    `;

    const mockPRBody = `
      x__var4 = "new value"
      x__var5 = "false"
    `;

    (core.getInput as jest.Mock).mockReturnValue(mockInput);

    github.context.eventName = 'pull_request';
    github.context.payload = {
      pull_request: {
        number: 100,
        body: mockPRBody,
      }
    };

    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    // Act
    await run();

    // Assert
    expect(core.info).toHaveBeenCalledWith(
      `pragma default variables: ${JSON.stringify({ var1: 'test', var2: 42, var3: true }, undefined, 2)}`
    );
    expect(core.info).toHaveBeenCalledWith(
      `pragma override variables: ${JSON.stringify({ var4: 'new value', var5: false }, undefined, 2)}`
    );
    const expectedOutput = {
      var1: 'test',
      var2: 42,
      var3: true,
      var4: 'new value',
      var5: false,
    };

    expect(core.info).toHaveBeenCalledWith(
      `merged json: ${JSON.stringify(expectedOutput, undefined, 2)}`
    );

    expect(core.setOutput).toHaveBeenCalledWith("pragma", expectedOutput);
  });

  test('should handle cases when no PR body is available', async () => {
    // Arrange
    const mockInput = `
      var1=test
      var2=42
      var3=true
    `;

    (core.getInput as jest.Mock).mockReturnValue(mockInput);

    // Mock github.context for a non-pull_request event
    github.context.eventName = 'push';
    github.context.payload = {}; // No PR body available

    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    // Act
    await run();

    // Assert: Ensure the output is just the parsed input without any PR overrides
    const expectedOutput = {
      var1: 'test',
      var2: 42,
      var3: true,
    };

    expect(core.setOutput).toHaveBeenCalledWith('pragma', expectedOutput);
  });

  test('should handle cases when last variable does not have a newline', async () => {
    // Arrange
    (core.getInput as jest.Mock).mockReturnValue('');

    // Mock github.context for a non-pull_request event
    github.context.eventName = 'pull_request';
    github.context.payload = {
      pull_request: {
        number: 100,
        body: "[affected][newfeature]: initial commit of affected action with tests\r\n\r\nx__pragma=testing",
      }
    };
    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    // Act
    await run();

    // Assert: Ensure the output is just the parsed input without any PR overrides
    const expectedOutput = {
      pragma: 'testing'
    };

    expect(core.setOutput).toHaveBeenCalledWith('pragma', expectedOutput);
  });
});
