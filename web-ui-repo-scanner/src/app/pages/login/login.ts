import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.scss'],
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.user()) void this.router.navigate(['/']);
    });
  }

  protected async google(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.loginGoogle();
    } catch (err) {
      this.error.set(this.describe(err));
    } finally {
      this.busy.set(false);
    }
  }

  private describe(err: unknown): string {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          return 'Se cerró la ventana de Google.';
        case 'auth/popup-blocked':
          return 'El navegador bloqueó la ventana emergente.';
        case 'auth/unauthorized-domain':
          return 'Este dominio no está autorizado en Firebase.';
        default:
          return 'No se pudo iniciar sesión.';
      }
    }
    return 'No se pudo iniciar sesión.';
  }
}
