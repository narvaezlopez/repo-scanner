import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AnalysisResult, Job } from '../models/job';

export interface CreateJobResponse {
  jobId: string;
}

type WsMessage =
  | { type: 'snapshot'; jobId: string; job: Job | null }
  | { type: 'progress'; jobId: string; step: Job['step']; progress: number; message: string }
  | { type: 'done'; jobId: string; result: AnalysisResult }
  | { type: 'error'; jobId: string; message: string };

@Injectable({ providedIn: 'root' })
export class RepoScannerApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/v1/jobs`;

  createJob(zip: File): Observable<CreateJobResponse> {
    const form = new FormData();
    form.append('repo', zip);
    return this.http.post<CreateJobResponse>(this.base, form);
  }

  // fallback si el WS se cae
  getJob(id: string): Observable<Job> {
    return this.http.get<Job>(`${this.base}/${id}`);
  }

  // se suscribe por WS y emite el job en cada evento; completa en done/error,
  // lanza si la conexión se cae antes
  watchJob(jobId: string): Observable<Job> {
    return new Observable<Job>((subscriber) => {
      const ws = new WebSocket(`${this.wsOrigin()}/ws`);
      let job: Job = skeleton(jobId);
      let settled = false;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', jobId }));

      ws.onmessage = (ev) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }

        if (msg.type === 'snapshot') {
          if (msg.job) job = msg.job;
        } else if (msg.type === 'progress') {
          job = { ...job, status: 'running', step: msg.step, progress: msg.progress };
        } else if (msg.type === 'done') {
          job = { ...job, status: 'done', step: 'done', progress: 100, result: msg.result };
        } else if (msg.type === 'error') {
          job = { ...job, status: 'error', error: msg.message };
        }

        subscriber.next(job);
        if (job.status === 'done' || job.status === 'error') {
          settled = true;
          subscriber.complete();
          ws.close();
        }
      };

      ws.onerror = () => {
        if (!settled) subscriber.error(new Error('ws_error'));
      };
      ws.onclose = () => {
        if (!settled) subscriber.error(new Error('ws_closed'));
      };

      return () => ws.close();
    });
  }

  private wsOrigin(): string {
    if (environment.wsBaseUrl) return environment.wsBaseUrl;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
}

function skeleton(id: string): Job {
  return {
    id,
    status: 'running',
    source: { kind: 'zip', name: '', bytes: 0 },
    progress: 0,
    step: null,
    result: null,
    error: null,
    createdAt: '',
    updatedAt: '',
  };
}
