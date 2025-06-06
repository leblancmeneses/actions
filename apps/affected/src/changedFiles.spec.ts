/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('child_process');
jest.mock('@actions/github', () => {
  return {
    context: {
      eventName: 'pull_request',
      payload: {
        pull_request: {
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' }
        }
      },
      sha: 'commit-sha'
    }
  };
});
jest.mock('fs', () => {
  const originalModule = jest.requireActual('fs');
  return {
    ...originalModule,
    existsSync: jest.fn(),
  };
});
import { execSync } from 'child_process';
import * as github from '@actions/github';
import { ChangeStatus, mapGitStatusCode, getChangedFiles } from  "./changedFiles";
import { EXEC_SYNC_MAX_BUFFER } from './constants';
import * as fs from 'fs';


describe('changed-files.spec', () => {

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {
      // Noop.
    });
    jest.spyOn(console, 'error').mockImplementation(() => {
      // Noop.
    });
    jest.spyOn(fs, 'existsSync')
      .mockImplementation(() => {
        return true;
      });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('mapGitStatusCode', () => {
    it('maps known codes to correct ChangeStatus', () => {
      expect(mapGitStatusCode('A')).toBe(ChangeStatus.Added);
      expect(mapGitStatusCode('C')).toBe(ChangeStatus.Copied);
      expect(mapGitStatusCode('D')).toBe(ChangeStatus.Deleted);
      expect(mapGitStatusCode('M')).toBe(ChangeStatus.Modified);
      expect(mapGitStatusCode('R')).toBe(ChangeStatus.Renamed);
      expect(mapGitStatusCode('U')).toBe(ChangeStatus.Unmerged);
      expect(mapGitStatusCode('B')).toBe(ChangeStatus.Broken);
      expect(mapGitStatusCode('X')).toBe(ChangeStatus.Unknown);
    });

    it('returns Unknown for unrecognized codes', () => {
      expect(mapGitStatusCode('?')).toBe(ChangeStatus.Unknown);
    });
  });

  describe('getChangedFiles', () => {
    const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset the GitHub context to a known default state
      (github.context as any).eventName = 'pull_request';
      (github.context as any).payload = {
        pull_request: {
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' }
        }
      };
      (github.context as any).sha = 'commit-sha';

      delete process.env.BASE_SHA;
      delete process.env.HEAD_SHA;
    });

    it('returns an empty array if no changes are detected', async () => {
      mockExecSync.mockReturnValueOnce('');
      const files = await getChangedFiles();
      expect(files).toEqual([]);
      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status base-sha head-sha', { encoding: 'utf-8', maxBuffer: EXEC_SYNC_MAX_BUFFER });
    });

    it('parses rename status ignoring score', async () => {
      const gitOutput = `R100\tinfrascripts/errorsink/001-init-service.sh\tinfrascripts/projectX/001-init-errorsink-service.sh\nD\tdeleted-file.md`;
      mockExecSync.mockReturnValueOnce(gitOutput);

      const files = await getChangedFiles();
      expect(files).toEqual([
        { file: 'infrascripts/errorsink/001-init-service.sh', status: ChangeStatus.Renamed },
        { file: 'infrascripts/projectX/001-init-errorsink-service.sh', status: ChangeStatus.Renamed },
        { file: 'deleted-file.md', status: ChangeStatus.Deleted },
      ]);
    });

    it('parses changed files for a pull_request event', async () => {
      const gitOutput = `A\tadded-file.txt\nM\tmodified-file.js\nD\tdeleted-file.md`;
      mockExecSync.mockReturnValueOnce(gitOutput);

      const files = await getChangedFiles();
      expect(files).toEqual([
        { file: 'added-file.txt', status: ChangeStatus.Added },
        { file: 'modified-file.js', status: ChangeStatus.Modified },
        { file: 'deleted-file.md', status: ChangeStatus.Deleted }
      ]);
    });

    it('parses changed files with an unknown status', async () => {
      const gitOutput = `X\tstrange-file.dat`;
      mockExecSync.mockReturnValueOnce(gitOutput);

      const files = await getChangedFiles();
      expect(files).toEqual([{ file: 'strange-file.dat', status: ChangeStatus.Unknown }]);
    });

    it('uses BASE_SHA and HEAD_SHA env vars if provided', async () => {
      (github.context as any).eventName = 'workflow_dispatch';
      process.env.BASE_SHA = 'env-base-sha';
      process.env.HEAD_SHA = 'env-head-sha';

      mockExecSync.mockReturnValueOnce('');

      await getChangedFiles();
      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status env-base-sha env-head-sha', { encoding: 'utf-8', maxBuffer: EXEC_SYNC_MAX_BUFFER  });
    });

    it('handles push event', async () => {
      (github.context as any).eventName = 'push';
      (github.context as any).payload = {
        before: 'base2',
        after: 'head2'
      };
      mockExecSync.mockReturnValueOnce('');
      
      await getChangedFiles();
      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status base2 head2', { encoding: 'utf-8', maxBuffer: EXEC_SYNC_MAX_BUFFER  });
    });

    it('handles unknown events by falling back to HEAD~1 and HEAD', async () => {
      (github.context as any).eventName = 'unknown_event';
      mockExecSync.mockReturnValueOnce('');

      await getChangedFiles();
      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status HEAD~1 HEAD', { encoding: 'utf-8', maxBuffer: EXEC_SYNC_MAX_BUFFER  });
    });

    it('handles filenames with tabs (unlikely, but safe)', async () => {
      const gitOutput = `M\tfile\twith\ttabs.txt\nA\tfile2.txt`;
      mockExecSync.mockReturnValueOnce(gitOutput);

      const files = await getChangedFiles();
      // The first line's split should rejoin correctly
      expect(files).toEqual([
        { file: 'file\twith\ttabs.txt', status: ChangeStatus.Modified },
        { file: 'file2.txt', status: ChangeStatus.Added }
      ]);
    });
  });
});
