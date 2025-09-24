import { execSync } from 'child_process';
import * as github from '@actions/github';
import { EXEC_SYNC_MAX_BUFFER } from './constants';
import { promises as fs } from 'fs';
import path from 'path';

export enum ChangeStatus {
  Added = 'added',
  Copied = 'copied',
  Deleted = 'deleted',
  Modified = 'modified',
  Renamed = 'renamed',
  Unmerged = 'unmerged',
  Broken = 'broken',
  Unknown = 'unknown'
}

export type ChangedFile = { file: string; status: ChangeStatus };

export function mapGitStatusCode(code: string): ChangeStatus {
  switch (code) {
    case 'A':
      return ChangeStatus.Added;
    case 'C':
      return ChangeStatus.Copied;
    case 'D':
      return ChangeStatus.Deleted;
    case 'M':
      return ChangeStatus.Modified;
    case 'R':
      return ChangeStatus.Renamed;
    case 'U':
      return ChangeStatus.Unmerged;
    case 'B':
      return ChangeStatus.Broken;
    case 'X':
      return ChangeStatus.Unknown;
    default:
      console.error(`Unknown status code: ${code}`);
      return ChangeStatus.Unknown;
  }
}

export const getChangedFiles = async (): Promise<ChangedFile[]> => {
  let changedFiles: ChangedFile[] = [];
  let baseDiffCommand: string;

  if (process.env['ACT'] === 'true') {
    baseDiffCommand = 'git diff HEAD --name-status';
  } else if (github.context.eventName === 'pull_request') {
    // Use merge-base to find the actual branching point, not GitHub's base SHA
    const baseBranch = github.context.payload?.pull_request?.base?.ref || 'main';
    const headSha = github.context.payload?.pull_request?.head?.sha;
    baseDiffCommand = `git diff --name-status $(git merge-base origin/${baseBranch} ${headSha}) ${headSha}`;
  } else if (github.context.eventName === 'push') {
    baseDiffCommand = `git diff --name-status ${github.context.payload?.before} ${github.context.payload?.after}`;
  } else if (process.env.BASE_SHA && process.env.HEAD_SHA) {
    baseDiffCommand = `git diff --name-status ${process.env.BASE_SHA} ${process.env.HEAD_SHA}`;
  } else {
    // Fallback: compare HEAD with HEAD~1 if event is unknown
    baseDiffCommand = 'git diff --name-status HEAD~1 HEAD';
  }

  const output = execSync(baseDiffCommand, { encoding: 'utf-8', maxBuffer: EXEC_SYNC_MAX_BUFFER }).trim();
  if (output) {
    // Each line of output is formatted like: "<STATUS>\t<FILE_PATH>"
    changedFiles = output
      .split('\n')
      .filter(Boolean)
      .reduce((accumulator, line) => {
        const [statusCode, ...fileParts] = line.split('\t');
        const filePath = fileParts.join('\t'); // In case filename contains tabs (unlikely, but safe)
        const status = mapGitStatusCode(statusCode[0]);
        if(status === ChangeStatus.Renamed) {
          // Renamed files have two paths
          const [oldPath, newPath] = filePath.split(/\s+/);
          accumulator.push({ file: oldPath, status: ChangeStatus.Renamed });
          accumulator.push({ file: newPath, status: ChangeStatus.Renamed });
        } else {
          accumulator.push({ file: filePath, status });
        }
        return accumulator;
      }, [] as ChangedFile[]);
  }

  return changedFiles;
};


export const writeChangedFiles = async (changed_files_output_path: string, changedFiles: ChangedFile[]): Promise<void> => {
  const directory = path.dirname(changed_files_output_path);
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create directory at ${directory}: ${err.message}`, { cause: err });
  }

  try {
    await fs.writeFile(changed_files_output_path, JSON.stringify(changedFiles, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`Failed to write changed files to ${changed_files_output_path}: ${err.message}`, { cause: err });
  }
}