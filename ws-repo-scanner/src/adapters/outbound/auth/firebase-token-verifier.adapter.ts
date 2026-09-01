import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { TokenVerifierPort, VerifiedToken } from '../../../core/ports/token-verifier.port.js';

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

// verifica los ID token de Firebase con el Admin SDK; el project_id sale del propio JSON
export class FirebaseTokenVerifier implements TokenVerifierPort {
  constructor(serviceAccountJson: string) {
    if (getApps().length === 0) {
      const sa = JSON.parse(serviceAccountJson) as ServiceAccountJson;
      initializeApp({
        credential: cert({
          projectId: sa.project_id,
          clientEmail: sa.client_email,
          privateKey: sa.private_key,
        }),
      });
    }
  }

  async verify(idToken: string): Promise<VerifiedToken> {
    const decoded = await getAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  }
}
