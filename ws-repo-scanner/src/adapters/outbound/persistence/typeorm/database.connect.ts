import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { config } from '../../../../config.js';
import { logger } from '../../../../logger.js';

type Entities = DataSourceOptions['entities'];

export class DatabaseConnect {
  private static readonly instances = new Map<string, DataSource>();

  public static async get(name: string, entities: Entities): Promise<DataSource> {
    const existing = this.instances.get(name);
    if (existing?.isInitialized) {
      return existing;
    }

    const dataSource = new DataSource({
      type: 'postgres',
      host: config.DB_HOST ?? 'localhost',
      port: config.DB_PORT,
      username: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      schema: config.DB_SCHEMA,
      ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
      synchronize: false,
      logging: config.DB_LOGGING,
      entities,
      extra: {
        connectionTimeoutMillis: 30_000,
        idleTimeoutMillis: 10_000,
        max: 3,
        min: 0,
      },
    });

    try {
      await dataSource.initialize();
      logger.info({ db: name, schema: config.DB_SCHEMA }, '✅ Conexión a Postgres inicializada');
      this.instances.set(name, dataSource);
      return dataSource;
    } catch (error) {
      logger.error({ db: name, err: error }, '❌ Error al inicializar la conexión a Postgres');
      throw error;
    }
  }

  public static async closeAll(): Promise<void> {
    await Promise.all(
      [...this.instances.values()].map((ds) => (ds.isInitialized ? ds.destroy() : undefined)),
    );
    this.instances.clear();
  }
}
