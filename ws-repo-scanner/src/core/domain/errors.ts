export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidRepoArchiveError extends DomainError {
  constructor(message: string) {
    super(message, 'invalid_repo_archive');
  }
}

export class JobNotFoundError extends DomainError {
  constructor(id: string) {
    super(`job ${id} no encontrado`, 'job_not_found');
  }
}
