import { Component, inject, signal } from '@angular/core';

import { Landing } from '../../components/landing/landing';
import { RepoScannerApi } from '../../services/api';
import type { RepoSource } from '../../models/repo-source';

@Component({
  imports: [Landing],
  selector: 'app-home',
  styleUrls: ['./home.scss'],
  templateUrl: './home.html',
})
export class Home {
  private readonly api = inject(RepoScannerApi);

  protected readonly loading = signal(false);
  protected readonly jobId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected onSource(source: RepoSource): void {
    this.jobId.set(null);
    this.error.set(null);

    if (source.kind !== 'upload') {
      this.error.set('De momento solo se admite subir un archivo .zip.');
      return;
    }

    const zip = source.files.find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zip) {
      this.error.set('Selecciona un archivo .zip.');
      return;
    }

    this.loading.set(true);
    this.api.createJob(zip).subscribe({
      next: ({ jobId }) => {
        this.jobId.set(jobId);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'No se pudo crear el job.');
        this.loading.set(false);
      },
    });
  }
}
