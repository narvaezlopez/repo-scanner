import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateJobResponse {
  jobId: string;
}

@Injectable({ providedIn: 'root' })
export class RepoScannerApi {
  private readonly http = inject(HttpClient);
  createJob(zip: File): Observable<CreateJobResponse> {
    const form = new FormData();
    form.append('repo', zip);
    return this.http.post<CreateJobResponse>(`${environment.apiBaseUrl}/api/v1/jobs`, form);
  }
}
