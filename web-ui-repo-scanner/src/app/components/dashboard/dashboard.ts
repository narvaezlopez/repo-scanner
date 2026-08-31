import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AnalysisResult } from '../../models/job';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly result = input.required<AnalysisResult>();
  readonly name = input<string>('');

  protected readonly confidencePct = computed(() =>
    Math.round((this.result().architecture.confidence ?? 0) * 100),
  );
}
