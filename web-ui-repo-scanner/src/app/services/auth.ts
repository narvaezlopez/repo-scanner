import { Injectable, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { environment } from '../../environments/environment';

if (getApps().length === 0) {
  initializeApp(environment.firebase);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = getAuth();

  readonly user = signal<User | null>(null);

  // se resuelve cuando Firebase entrega el primer estado de sesión
  readonly ready: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.ready = new Promise<void>((r) => (resolveReady = r));

    onIdTokenChanged(this.auth, (u) => {
      this.user.set(u);
      resolveReady();
    });
  }

  loginGoogle(): Promise<unknown> {
    return signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }

  async getToken(): Promise<string | null> {
    const current = this.auth.currentUser;
    return current ? current.getIdToken() : null;
  }
}
