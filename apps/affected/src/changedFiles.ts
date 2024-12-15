import { execSync } from 'child_process';
import * as github from '@actions/github';

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
  const eventName = github.context.eventName;
  const baseSha = process.env.BASE_SHA || github.context.payload?.pull_request?.base?.sha || github.context.sha;
  const headSha = process.env.HEAD_SHA || github.context.payload?.pull_request?.head?.sha || github.context.sha;

  let changedFiles: ChangedFile[] = [];
  let baseDiffCommand: string;

  if (eventName === 'pull_request' || eventName === 'workflow_dispatch') {
    // Pull request or workflow dispatch event
    baseDiffCommand = `git diff --name-status ${baseSha} ${headSha}`;
  } else if (eventName === 'push') {
    // Push event (compare HEAD with HEAD~1)
    baseDiffCommand = 'git diff --name-status HEAD~1 HEAD';
  } else {
    // Fallback: compare HEAD with HEAD~1 if event is unknown
    baseDiffCommand = 'git diff --name-status HEAD~1 HEAD';
  }

  const output = execSync(baseDiffCommand, { encoding: 'utf-8' }).trim();
  if (output) {
    // Each line of output is formatted like: "<STATUS>\t<FILE_PATH>"
    changedFiles = output
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [statusCode, ...fileParts] = line.split('\t');
        const filePath = fileParts.join('\t'); // In case filename contains tabs (unlikely, but safe)
        const status = mapGitStatusCode(statusCode);
        return { file: filePath, status };
      });
  }

  return changedFiles;
};