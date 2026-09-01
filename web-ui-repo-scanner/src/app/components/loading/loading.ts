import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  viewChild,
} from '@angular/core';
import type { AnimationItem } from 'lottie-web';
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
export class Loading implements AfterViewInit, OnDestroy {
  readonly progress = input<number>(0);
  readonly step = input<AnalysisStep | 'upload' | null>(null);
  readonly name = input<string>('');
  readonly message = input<string>('');
  readonly animation = input<string>('animations/loading.json');

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('anim');
  private anim?: AnimationItem;

  protected readonly label = computed(
    () => this.message() || STEP_LABEL[this.step() ?? ''] || 'Analizando…',
  );
  protected readonly pct = computed(() => Math.max(3, Math.min(100, this.progress())));

  async ngAfterViewInit(): Promise<void> {
    try {
      const lottie = (await import('lottie-web')).default;
      this.anim = lottie.loadAnimation({
        container: this.host().nativeElement,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: this.animation(),
      });
      // sin fichero de animación el número sigue mostrándose; evitamos ruido en consola
      this.anim.addEventListener('data_failed', () => this.anim?.destroy());
    } catch {
      // si la animación no carga, el porcentaje se muestra igual
    }
  }

  ngOnDestroy(): void {
    this.anim?.destroy();
  }
}
