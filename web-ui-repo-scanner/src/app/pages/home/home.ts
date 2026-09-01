import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Landing } from '../../components/landing/landing';
import { Loading } from '../../components/loading/loading';
import { Dashboard } from '../../components/dashboard/dashboard';
import { RepoScannerApi } from '../../services/api';
import { AuthService } from '../../services/auth';
import type { Job } from '../../models/job';
import type { RepoSource } from '../../models/repo-source';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

@Component({
  imports: [Landing, Loading, Dashboard],
  selector: 'app-home',
  styleUrls: ['./home.scss'],
  templateUrl: './home.html',
})
export class Home {
  private readonly api = inject(RepoScannerApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly phase = signal<Phase>('idle');
  protected readonly job = signal<Job | null>(null);
  protected readonly errorMsg = signal<string | null>(null);

  protected async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }

  protected onSource(source: RepoSource): void {
    this.errorMsg.set(null);
    this.job.set(null);
    this.phase.set('uploading');

    const request$ =
      source.kind === 'git'
        ? this.api.createJobFromUrl(source.url)
        : this.pickZip(source.files);

    if (!request$) return;

    request$.subscribe({
      next: ({ jobId }) => this.watch(jobId),
      error: (err) => this.fail(err?.error?.message ?? 'No se pudo iniciar el análisis.'),
    });
  }

  private pickZip(files: File[]) {
    const zip = files.find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zip) {
      this.fail('Selecciona un archivo .zip.');
      return null;
    }
    return this.api.createJob(zip);
  }

  protected reset(): void {
    this.phase.set('idle');
    this.job.set(null);
    this.errorMsg.set(null);
  }

  // sigue el análisis por WS; si se cae, un GET de rescate
  private watch(jobId: string): void {
    this.phase.set('analyzing');
    this.api.watchJob(jobId).subscribe({
      next: (job) => this.apply(job),
      error: () =>
        this.api.getJob(jobId).subscribe({
          next: (job) => {
            this.apply(job);
            if (job.status === 'running' || job.status === 'queued') {
              this.fail('Se perdió la conexión con el servidor.');
            }
          },
          error: () => this.fail('Se perdió la conexión con el servidor.'),
        }),
    });
  }

  private apply(job: Job): void {
    this.job.set(job);
    if (job.status === 'done') this.phase.set('done');
    else if (job.status === 'error') this.fail(job.error ?? 'El análisis falló.');
  }

  private fail(message: string): void {
    this.errorMsg.set(message);
    this.phase.set('error');
  }
}
