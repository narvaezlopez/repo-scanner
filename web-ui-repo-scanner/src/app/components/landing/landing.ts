import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import type { RepoSource } from '../../models/repo-source';

interface Selection {
  name: string;
  files: File[];
  totalBytes: number;
}

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  readonly source = output<RepoSource>();

  protected readonly dragging = signal(false);
  protected readonly reading = signal(false);
  protected readonly selection = signal<Selection | null>(null);
  protected readonly url = signal('');
  protected readonly error = signal<string | null>(null);

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    this.error.set(null);

    const items = event.dataTransfer?.items;
    const entries = items
      ? Array.from(items)
          .map((item) => item.webkitGetAsEntry?.())
          .filter((entry): entry is FileSystemEntry => entry != null)
      : [];

    this.reading.set(true);
    try {
      if (entries.length) {
        const files = (await Promise.all(entries.map((entry) => this.walk(entry)))).flat();
        this.setSelection(entries[0]?.name ?? 'repositorio', files);
      } else if (event.dataTransfer?.files.length) {
        const files = Array.from(event.dataTransfer.files);
        this.setSelection(files[0]?.name ?? 'archivo', files);
      }
    } catch {
      this.error.set('No se pudo leer la carpeta arrastrada.');
    } finally {
      this.reading.set(false);
    }
  }

  private async walk(entry: FileSystemEntry, prefix = ''): Promise<File[]> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      Object.defineProperty(file, 'relativePath', {
        value: prefix + file.name,
        enumerable: true,
      });
      return [file];
    }

    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) break;
      children.push(...batch);
    }

    const nested = await Promise.all(
      children.map((child) => this.walk(child, `${prefix}${entry.name}/`)),
    );
    return nested.flat();
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (!list?.length) return;

    const files = Array.from(list);
    const name =
      files[0]?.webkitRelativePath?.split('/')[0] || files[0]?.name || 'repositorio';
    this.setSelection(name, files);
    input.value = '';
  }

  protected confirmUpload(): void {
    const current = this.selection();
    if (!current) return;
    this.source.emit({
      kind: 'upload',
      name: current.name,
      files: current.files,
      totalBytes: current.totalBytes,
    });
  }

  protected clearSelection(): void {
    this.selection.set(null);
    this.error.set(null);
  }

  protected onUrlInput(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected submitUrl(): void {
    const value = this.url().trim();
    if (!this.looksLikeRepoUrl(value)) {
      this.error.set('Introduce una URL de repositorio Git válida.');
      return;
    }
    this.error.set(null);
    this.source.emit({ kind: 'git', url: value });
  }

  private setSelection(name: string, files: File[]): void {
    if (!files.length) {
      this.error.set('La selección no contiene archivos.');
      return;
    }
    this.selection.set({
      name,
      files,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    });
  }

  private looksLikeRepoUrl(value: string): boolean {
    return /^(https?:\/\/[^\s/]+\.[^\s/]+\/\S+|git@[^\s:]+:\S+)$/.test(value);
  }

  protected humanSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(unit > 0 && size < 10 ? 1 : 0)} ${units[unit]}`;
  }
}
