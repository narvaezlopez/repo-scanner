import { Component, inject, signal } from '@angular/core';

import { Landing } from '../../components/landing/landing';
import { Loading } from '../../components/loading/loading';
import { Dashboard } from '../../components/dashboard/dashboard';
import { RepoScannerApi } from '../../services/api';
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

  protected readonly phase = signal<Phase>('idle');
  protected readonly job = signal<Job | null>(null);
  protected readonly errorMsg = signal<string | null>(null);

  protected onSource(source: RepoSource): void {
    this.errorMsg.set(null);
    this.job.set(null);

    if (source.kind !== 'upload') {
      this.fail('De momento solo se admite subir un archivo .zip.');
      return;
    }
    const zip = source.files.find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zip) {
      this.fail('Selecciona un archivo .zip.');
      return;
    }

    this.phase.set('uploading');
    this.api.createJob(zip).subscribe({
      next: ({ jobId }) => this.watch(jobId),
      error: (err) => this.fail(err?.error?.message ?? 'No se pudo subir el repositorio.'),
    });
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
