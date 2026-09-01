import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth';

// adjunta el ID token de Firebase a las llamadas de la API; ante 401, cierra sesión
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/v1/')) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.getToken()).pipe(
    switchMap((token) =>
      next(
        token
          ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
          : req,
      ),
    ),
    catchError((err) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        void auth.logout();
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
