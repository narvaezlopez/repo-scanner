import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AnalysisResult } from '../../../../../core/domain/analysis-result.js';
import type { AnalysisStep, JobSourceKind, JobStatus } from '../../../../../core/domain/job.js';

@Entity({ name: 'jobs' })
export class JobEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  status!: JobStatus;

  @Column({ name: 'source_kind', type: 'varchar', length: 8 })
  sourceKind!: JobSourceKind;

  @Column({ name: 'source_name', type: 'varchar', length: 512 })
  sourceName!: string;

  @Column({ name: 'source_bytes', type: 'bigint' })
  sourceBytes!: string;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  step!: AnalysisStep | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  result!: AnalysisResult | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
