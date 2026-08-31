import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AnalysisStep } from '../../models/job';

const STEP_LABEL: Record<string, string> = {
  upload: 'Subiendo el repositorio…',
  structure: 'Analizando la estructura de carpetas…',
  manifests: 'Leyendo los manifiestos (package.json, Dockerfile…)…',
  llm: 'Infiriendo el propósito y la arquitectura…',
  done: 'Finalizando…',
};

@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './loading.html',
  styleUrl: './loading.scss',
})
export class Loading {
  readonly progress = input<number>(0);
  readonly step = input<AnalysisStep | 'upload' | null>(null);
  readonly name = input<string>('');
  readonly message = input<string>('');

  protected readonly label = computed(
    () => this.message() || STEP_LABEL[this.step() ?? ''] || 'Analizando…',
  );
  protected readonly pct = computed(() => Math.max(3, Math.min(100, this.progress())));
}
