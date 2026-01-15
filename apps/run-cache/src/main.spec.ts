// Mock all external dependencies before imports
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('./s3-client');

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { initializeS3Client, checkObjectExists, readObject, writeObject } from './s3-client';
import { run } from './main';

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit() was called');
});

describe('run-cache', () => {
  let mockGetInput: jest.Mock;
  let mockSetOutput: jest.Mock;
  let mockInfo: jest.Mock;
  let mockWarning: jest.Mock;
  let mockDebug: jest.Mock;
  let mockExec: jest.Mock;
  let mockInitializeS3Client: jest.Mock;
  let mockCheckObjectExists: jest.Mock;
  let mockReadObject: jest.Mock;
  let mockWriteObject: jest.Mock;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    mockExit.mockClear();

    // Setup S3 client mocks
    mockInitializeS3Client = initializeS3Client as jest.Mock;
    mockCheckObjectExists = checkObjectExists as jest.Mock;
    mockReadObject = readObject as jest.Mock;
    mockWriteObject = writeObject as jest.Mock;

    // Setup core mocks
    mockGetInput = core.getInput as jest.Mock;
    mockSetOutput = core.setOutput as jest.Mock;
    (core.setFailed as jest.Mock).mockImplementation((message: string) => {
      throw new Error(`Action failed: ${message}`);
    });
    mockInfo = core.info as jest.Mock;
    mockWarning = core.warning as jest.Mock;
    mockDebug = core.debug as jest.Mock;

    // Setup exec mock
    mockExec = exec.exec as jest.Mock;

    process.env.JEST_WORKER_ID = '1'; // Ensure we're in test environment
  });

  describe('Basic Functionality', () => {
    it('should skip execution when cache hit occurs (simple mode)', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/test-key';
          case 'include-stdout': return 'false';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(true);

      // Act
      await run();

      // Assert
      expect(mockInitializeS3Client).toHaveBeenCalledWith({
        accessKey: 'test-access-key',
        secretKey: 'test-secret-key',
        endpoint: undefined,
        region: undefined,
      });
      expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://test-bucket/cache/test-key');
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockExec).not.toHaveBeenCalled(); // Should not execute command
      expect(mockInfo).toHaveBeenCalledWith('Cache hit for path: gs://test-bucket/cache/test-key');
      expect(mockInfo).toHaveBeenCalledWith('Skipping command execution due to cache hit');
    });

    it('should execute command and create cache on cache miss', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'echo "hello world"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/new-key';
          case 'include-stdout': return 'false';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(false);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: exec.ExecOptions) => {
        options.listeners?.stdout?.(Buffer.from('hello world\n'));
        return 0;
      });
      mockWriteObject.mockResolvedValue(undefined);

      // Act
      await run();

      // Assert
      expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://test-bucket/cache/new-key');
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockExec).toHaveBeenCalledWith('bash', ['-c', 'echo "hello world"'], expect.any(Object));
      expect(mockWriteObject).toHaveBeenCalled();
      expect(mockInfo).toHaveBeenCalledWith('Cache marker created at: gs://test-bucket/cache/new-key');
    });

    it('should not create cache when command fails', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'exit 1';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/fail-key';
          case 'include-stdout': return 'false';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(false);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: exec.ExecOptions) => {
        options.listeners?.stderr?.(Buffer.from('Command failed\n'));
        return 1; // Non-zero exit code
      });

      // Act & Assert
      await expect(run()).rejects.toThrow('Action failed: process.exit() was called');

      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockWriteObject).not.toHaveBeenCalled(); // Should not cache failed results
      expect(mockInfo).toHaveBeenCalledWith('Command failed with exit code 1, not creating cache');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Include Stdout Functionality', () => {
    it('should return cached stdout when cache hit occurs with include-stdout=true', async () => {
      // Arrange
      const cachedData = {
        created: new Date().toISOString(),
        command: 'echo "cached output"',
        success: true,
        stdout: 'cached output'
      };

      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/stdout-test';
          case 'include-stdout': return 'true';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(true);
      mockReadObject.mockResolvedValue(JSON.stringify(cachedData));

      // Act
      await run();

      // Assert
      expect(mockCheckObjectExists).toHaveBeenCalled();
      expect(mockReadObject).toHaveBeenCalled();
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'cached output');
      expect(mockExec).not.toHaveBeenCalled(); // Should not execute command
    });

    it('should execute command and cache stdout when include-stdout=true', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'echo "fresh output"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/stdout-new';
          case 'include-stdout': return 'true';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(false);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: exec.ExecOptions) => {
        options.listeners?.stdout?.(Buffer.from('fresh output\n'));
        return 0;
      });
      mockWriteObject.mockResolvedValue(undefined);

      // Act
      await run();

      // Assert
      expect(mockCheckObjectExists).toHaveBeenCalled();
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'fresh output');
      expect(mockExec).toHaveBeenCalledWith('bash', ['-c', 'echo "fresh output"'], expect.any(Object));
      expect(mockWriteObject).toHaveBeenCalledWith(
        'gs://test-bucket/cache/stdout-new',
        expect.stringContaining('"stdout": "fresh output"')
      );
      expect(mockInfo).toHaveBeenCalledWith('Cache with stdout created at: gs://test-bucket/cache/stdout-new');
    });

    it('should not return stdout when include-stdout=false even if cached', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/no-stdout';
          case 'include-stdout': return 'false';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(true);

      // Act
      await run();

      // Assert
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockSetOutput).not.toHaveBeenCalledWith('stdout', expect.anything());
      expect(mockReadObject).not.toHaveBeenCalled(); // Should not download cache content
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupt cached data gracefully', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return 'test-access-key';
          case 'secret-key': return 'test-secret-key';
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/corrupt';
          case 'include-stdout': return 'true';
          default: return '';
        }
      });

      mockCheckObjectExists.mockResolvedValue(true);
      mockReadObject.mockResolvedValue('invalid json{'); // Corrupt JSON

      // Act
      await run();

      // Assert
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockSetOutput).not.toHaveBeenCalledWith('stdout', expect.anything()); // No stdout due to corrupt data
      expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('Failed to parse cached data:'));
    });

    it('should run without cache when S3 credentials are not provided', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return '';
          case 'secret-key': return '';
          case 'run': return 'echo "no cache"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/no-creds';
          case 'include-stdout': return 'true';
          default: return '';
        }
      });

      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: exec.ExecOptions) => {
        options.listeners?.stdout?.(Buffer.from('no cache\n'));
        return 0;
      });

      // Act
      await run();

      // Assert
      expect(mockWarning).toHaveBeenCalledWith('S3 credentials not provided, running without cache');
      expect(mockExec).toHaveBeenCalled();
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'no cache');
      expect(mockCheckObjectExists).not.toHaveBeenCalled(); // Should not check cache
    });

    it('should propagate failure when command fails without credentials', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'access-key': return '';
          case 'secret-key': return '';
          case 'run': return 'exit 42';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/fail-no-creds';
          case 'include-stdout': return 'false';
          default: return '';
        }
      });

      mockExec.mockImplementation(async () => {
        return 42; // Custom exit code
      });

      // Act & Assert
      await expect(run()).rejects.toThrow('Action failed: process.exit() was called');

      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockExit).toHaveBeenCalledWith(42);
    });
  });

  describe('Shell Support', () => {
    it('should support different shell types with stdout caching', async () => {
      const shells = [
        { shell: 'sh', expectedCmd: 'sh', expectedArgs: ['-c'] },
        { shell: 'python', expectedCmd: 'python', expectedArgs: ['-c'] },
        { shell: 'node', expectedCmd: 'node', expectedArgs: ['-e'] }
      ];

      for (const { shell, expectedCmd, expectedArgs } of shells) {
        jest.clearAllMocks();

        mockGetInput.mockImplementation((name: string) => {
          switch (name) {
            case 'access-key': return 'test-access-key';
            case 'secret-key': return 'test-secret-key';
            case 'run': return 'test command';
            case 'shell': return shell;
            case 'working-directory': return '.';
            case 'cache-path': return `gs://test-bucket/cache/${shell}-test`;
            case 'include-stdout': return 'true';
            default: return '';
          }
        });

        mockCheckObjectExists.mockResolvedValue(false);
        mockExec.mockImplementation(async (_cmd: string, _args: string[], options: exec.ExecOptions) => {
          options.listeners?.stdout?.(Buffer.from(`${shell} output\n`));
          return 0;
        });
        mockWriteObject.mockResolvedValue(undefined);

        await run();

        expect(mockExec).toHaveBeenCalledWith(expectedCmd, [...expectedArgs, 'test command'], expect.any(Object));
        expect(mockSetOutput).toHaveBeenCalledWith('stdout', `${shell} output`);
      }
    });
  });
});
