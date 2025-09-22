import { CacheMetadata } from './types';

// Mock all external dependencies before imports
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@google-cloud/storage');

describe('run-cache', () => {
  let mockGetInput: jest.Mock;
  let mockSetOutput: jest.Mock;
  let mockSetFailed: jest.Mock;
  let mockInfo: jest.Mock;
  let mockWarning: jest.Mock;
  let mockDebug: jest.Mock;
  let mockExec: jest.Mock;
  let mockFile: any;
  let mockBucket: any;
  let mockStorageInstance: any;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup Storage mocks BEFORE importing modules
    mockFile = {
      exists: jest.fn(),
      download: jest.fn(),
      save: jest.fn()
    };
    mockBucket = {
      file: jest.fn().mockReturnValue(mockFile)
    };
    mockStorageInstance = {
      bucket: jest.fn().mockReturnValue(mockBucket)
    };

    // Mock the Storage constructor
    const { Storage } = require('@google-cloud/storage');
    (Storage as jest.Mock).mockImplementation(() => mockStorageInstance);

    // Setup core mocks
    const core = require('@actions/core');
    mockGetInput = core.getInput;
    mockSetOutput = core.setOutput;
    mockSetFailed = core.setFailed;
    mockInfo = core.info;
    mockWarning = core.warning;
    mockDebug = core.debug;

    // Setup exec mock
    const exec = require('@actions/exec');
    mockExec = exec.exec;

    // Default environment
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/credentials.json';
    process.env.JEST_WORKER_ID = '1'; // Ensure we're in test environment
  });

  afterEach(() => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    jest.resetModules();
  });

  describe('Positive Test Cases', () => {
    it('should return cached results when cache hit occurs', async () => {
      // Arrange
      const cachedData: CacheMetadata = {
        key: 'gs://test-bucket/cache/test-key',
        timestamp: Date.now() - 1000, // 1 second ago
        ttl: 86400,
        stdout: 'cached output',
        stderr: 'cached errors',
        exitCode: 0
      };

      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/test-key';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([true]);
      mockFile.download.mockResolvedValue([Buffer.from(JSON.stringify(cachedData))]);

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockFile.exists).toHaveBeenCalled();
      expect(mockFile.download).toHaveBeenCalled();
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'cached output');
      expect(mockSetOutput).toHaveBeenCalledWith('stderr', 'cached errors');
      expect(mockSetOutput).toHaveBeenCalledWith('exit-code', '0');
      expect(mockExec).not.toHaveBeenCalled(); // Should not execute command
      expect(mockInfo).toHaveBeenCalledWith('✅ Cache hit for path: gs://test-bucket/cache/test-key');
    });

    it('should execute command and cache results on cache miss', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "hello world"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/new-key';
          case 'ttl': return '3600';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([false]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('hello world\n'));
        return 0;
      });
      mockFile.save.mockResolvedValue([]);

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockFile.exists).toHaveBeenCalled();
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockExec).toHaveBeenCalledWith('bash', ['-c', 'echo "hello world"'], expect.any(Object));
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'hello world');
      expect(mockSetOutput).toHaveBeenCalledWith('exit-code', '0');
      expect(mockFile.save).toHaveBeenCalled();
      expect(mockInfo).toHaveBeenCalledWith('✅ Results cached successfully at: gs://test-bucket/cache/new-key');
    });

    it('should support different shell types', async () => {
      const shells = [
        { shell: 'sh', expectedCmd: 'sh', expectedArgs: ['-c'] },
        { shell: 'pwsh', expectedCmd: 'pwsh', expectedArgs: ['-Command'] },
        { shell: 'python', expectedCmd: 'python', expectedArgs: ['-c'] },
        { shell: 'node', expectedCmd: 'node', expectedArgs: ['-e'] }
      ];

      for (const { shell, expectedCmd, expectedArgs } of shells) {
        jest.clearAllMocks();

        mockGetInput.mockImplementation((name: string) => {
          switch (name) {
            case 'run': return 'test command';
            case 'shell': return shell;
            case 'working-directory': return '.';
            case 'cache-path': return 'gs://test-bucket/cache/shell-test';
            case 'ttl': return '3600';
            default: return '';
          }
        });

        mockFile.exists.mockResolvedValue([false]);
        mockExec.mockResolvedValue(0);

        const { run } = require('./main');
        await run();

        expect(mockExec).toHaveBeenCalledWith(expectedCmd, [...expectedArgs, 'test command'], expect.any(Object));
      }
    });
  });

  describe('Negative Test Cases', () => {
    it('should not cache results when command fails', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'exit 1';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/fail-key';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([false]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stderr(Buffer.from('Command failed\n'));
        return 1; // Non-zero exit code
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockSetOutput).toHaveBeenCalledWith('exit-code', '1');
      expect(mockFile.save).not.toHaveBeenCalled(); // Should not cache failed results
      expect(mockInfo).toHaveBeenCalledWith('⚠️ Command failed with exit code 1, not caching results');
    });

    it('should handle expired cache and re-execute command', async () => {
      // Arrange
      const expiredData: CacheMetadata = {
        key: 'gs://test-bucket/cache/expired-key',
        timestamp: Date.now() - (86400 * 1000 * 2), // 2 days ago
        ttl: 86400, // 1 day TTL
        stdout: 'old output',
        stderr: '',
        exitCode: 0
      };

      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "new output"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/expired-key';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([true]);
      mockFile.download.mockResolvedValue([Buffer.from(JSON.stringify(expiredData))]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('new output\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockInfo).toHaveBeenCalledWith('⏰ Cache expired for path: gs://test-bucket/cache/expired-key');
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockExec).toHaveBeenCalled(); // Should re-execute command
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'new output');
    });

    it('should run without cache when GOOGLE_APPLICATION_CREDENTIALS is not set', async () => {
      // Arrange
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "no cache"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/no-creds';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('no cache\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockWarning).toHaveBeenCalledWith('GOOGLE_APPLICATION_CREDENTIALS not set, running without cache');
      expect(mockExec).toHaveBeenCalled();
      expect(mockFile.exists).not.toHaveBeenCalled(); // Should not check cache
      expect(mockFile.save).not.toHaveBeenCalled(); // Should not save cache
    });

    it('should handle GCS errors gracefully during cache check', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/error-key';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockRejectedValue(new Error('GCS connection failed'));
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('test output\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockDebug).toHaveBeenCalledWith('Cache check failed: GCS connection failed');
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockExec).toHaveBeenCalled(); // Should still execute command
    });

    it('should handle GCS save errors gracefully', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "save test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/save-error';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([false]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('save test\n'));
        return 0;
      });
      mockFile.save.mockRejectedValue(new Error('Permission denied'));

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockWarning).toHaveBeenCalledWith('Failed to save cache: Permission denied');
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'save test'); // Should still output results
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid cache path format', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'invalid-path';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockSetFailed).toHaveBeenCalledWith(expect.stringContaining('Action failed:'));
    });

    it('should handle corrupt cache data', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "test"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/corrupt';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([true]);
      mockFile.download.mockResolvedValue([Buffer.from('invalid json{')]); // Corrupt JSON
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('fresh output\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockDebug).toHaveBeenCalledWith(expect.stringContaining('Cache check failed:'));
      expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockExec).toHaveBeenCalled(); // Should execute command on corrupt cache
    });

    it('should handle commands with both stdout and stderr', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "output" && >&2 echo "error"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/mixed-output';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([false]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('output\n'));
        options.listeners.stderr(Buffer.from('error\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockSetOutput).toHaveBeenCalledWith('stdout', 'output');
      expect(mockSetOutput).toHaveBeenCalledWith('stderr', 'error');
      expect(mockFile.save).toHaveBeenCalledWith(
        expect.stringContaining('"stdout": "output"'),
        expect.any(Object)
      );
      expect(mockFile.save).toHaveBeenCalledWith(
        expect.stringContaining('"stderr": "error"'),
        expect.any(Object)
      );
    });

    it('should handle working directory changes', async () => {
      // Arrange
      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'pwd';
          case 'shell': return 'bash';
          case 'working-directory': return '/tmp';
          case 'cache-path': return 'gs://test-bucket/cache/pwd-test';
          case 'ttl': return '86400';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([false]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        expect(options.cwd).toBe('/tmp');
        options.listeners.stdout(Buffer.from('/tmp\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockExec).toHaveBeenCalledWith(
        'bash',
        ['-c', 'pwd'],
        expect.objectContaining({ cwd: '/tmp' })
      );
    });

    it('should handle TTL of 0 (immediate expiry)', async () => {
      // Arrange
      const cachedData: CacheMetadata = {
        key: 'gs://test-bucket/cache/zero-ttl',
        timestamp: Date.now() - 1, // 1ms ago
        ttl: 0, // Immediate expiry
        stdout: 'should be expired',
        stderr: '',
        exitCode: 0
      };

      mockGetInput.mockImplementation((name: string) => {
        switch (name) {
          case 'run': return 'echo "new"';
          case 'shell': return 'bash';
          case 'working-directory': return '.';
          case 'cache-path': return 'gs://test-bucket/cache/zero-ttl';
          case 'ttl': return '0';
          default: return '';
        }
      });

      mockFile.exists.mockResolvedValue([true]);
      mockFile.download.mockResolvedValue([Buffer.from(JSON.stringify(cachedData))]);
      mockExec.mockImplementation(async (_cmd: string, _args: string[], options: any) => {
        options.listeners.stdout(Buffer.from('new\n'));
        return 0;
      });

      // Act
      const { run } = require('./main');
      await run();

      // Assert
      expect(mockInfo).toHaveBeenCalledWith('⏰ Cache expired for path: gs://test-bucket/cache/zero-ttl');
      expect(mockExec).toHaveBeenCalled(); // Should re-execute due to immediate expiry
    });
  });
});