import { randomUUID } from 'node:crypto';
import type { DataSource, Repository } from 'typeorm';
import type { User } from '../../../../core/domain/user.js';
import type { NewUser, UserStorePort } from '../../../../core/ports/user-store.port.js';
import { UserEntity } from './entities/user.entity.js';

function toDomain(e: UserEntity): User {
  return {
    id: e.id,
    firebaseUid: e.firebaseUid,
    email: e.email,
    createdAt: e.createdAt.toISOString(),
  };
}

export class PgUserStore implements UserStorePort {
  private readonly repo: Repository<UserEntity>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(UserEntity);
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const entity = await this.repo.findOne({ where: { firebaseUid } });
    return entity ? toDomain(entity) : undefined;
  }

  async create(user: NewUser): Promise<User> {
    const id = randomUUID();
    await this.repo.insert(
      this.repo.create({ id, firebaseUid: user.firebaseUid, email: user.email }),
    );
    return toDomain(await this.repo.findOneOrFail({ where: { id } }));
  }
}
