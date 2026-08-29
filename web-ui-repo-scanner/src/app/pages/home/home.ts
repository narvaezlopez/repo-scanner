import { Component, signal } from '@angular/core';

import { Landing } from '../../components/landing/landing';
import { Loading } from '../../components/loading/loading';
import { Dashboard } from '../../components/dashboard/dashboard';
import type { RepoSource } from '../../models/repo-source';

@Component({
  imports: [Landing, Loading, Dashboard],
  selector: 'app-home',
  styleUrls: ['./home.scss'],
  templateUrl: './home.html',
})
export class Home {
  protected readonly source = signal<RepoSource | null>(null);

  protected onSource(source: RepoSource): void {
    this.source.set(source);
  }
}
