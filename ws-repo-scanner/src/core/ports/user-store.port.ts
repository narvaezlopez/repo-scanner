import type { User } from '../domain/user.js';

export interface NewUser {
  firebaseUid: string;
  email: string;
}

export interface UserStorePort {
  findByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  create(user: NewUser): Promise<User>;
}
