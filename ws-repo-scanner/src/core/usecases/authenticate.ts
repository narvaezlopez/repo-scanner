import type { User } from '../domain/user.js';
import type { TokenVerifierPort } from '../ports/token-verifier.port.js';
import type { UserStorePort } from '../ports/user-store.port.js';

export class AuthenticateUseCase {
  constructor(
    private readonly deps: {
      tokens: TokenVerifierPort;
      users: UserStorePort;
    },
  ) {}

  // verifica el ID token y devuelve el usuario local; lo crea la primera vez (JIT)
  async execute(idToken: string): Promise<User> {
    const { uid, email } = await this.deps.tokens.verify(idToken);

    const existing = await this.deps.users.findByFirebaseUid(uid);
    if (existing) return existing;

    try {
      return await this.deps.users.create({ firebaseUid: uid, email: email ?? '' });
    } catch (err) {
      // otra petición del mismo usuario pudo insertarlo a la vez
      const retry = await this.deps.users.findByFirebaseUid(uid);
      if (retry) return retry;
      throw err;
    }
  }
}
