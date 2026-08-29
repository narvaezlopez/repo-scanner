export type RepoSource =
  | { kind: 'upload'; name: string; files: File[]; totalBytes: number }
  | { kind: 'git'; url: string };
