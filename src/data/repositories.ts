import type {
  Activity,
  Avatar,
  Book,
  Child,
  Evidence,
  Household,
  LessonAttempt,
  MasteryRecord,
  MediaRecord,
  Parent,
  PortfolioItem,
  ReadingSession,
  ReportRecord,
  RewardUnlock,
  TeacherInteraction,
} from '../domain/types';
import type { MetaRecord, TableName } from './schema';
import type { Database, Table, WriteOp } from './storage/types';

/** Typed table access + child-scoped helpers. */
export class Repositories {
  readonly households: Table<Household>;
  readonly parents: Table<Parent>;
  readonly children: Table<Child>;
  readonly avatars: Table<Avatar>;
  readonly books: Table<Book>;
  readonly readingSessions: Table<ReadingSession>;
  readonly activities: Table<Activity>;
  readonly evidence: Table<Evidence>;
  readonly mastery: Table<MasteryRecord>;
  readonly lessonAttempts: Table<LessonAttempt>;
  readonly teacherInteractions: Table<TeacherInteraction>;
  readonly rewardUnlocks: Table<RewardUnlock>;
  readonly portfolio: Table<PortfolioItem>;
  readonly media: Table<MediaRecord>;
  readonly reports: Table<ReportRecord>;
  readonly meta: Table<MetaRecord>;

  constructor(readonly db: Database) {
    this.households = db.table('households');
    this.parents = db.table('parents');
    this.children = db.table('children');
    this.avatars = db.table('avatars');
    this.books = db.table('books');
    this.readingSessions = db.table('readingSessions');
    this.activities = db.table('activities');
    this.evidence = db.table('evidence');
    this.mastery = db.table('mastery');
    this.lessonAttempts = db.table('lessonAttempts');
    this.teacherInteractions = db.table('teacherInteractions');
    this.rewardUnlocks = db.table('rewardUnlocks');
    this.portfolio = db.table('portfolio');
    this.media = db.table('media');
    this.reports = db.table('reports');
    this.meta = db.table('meta');
  }

  /** Every child-scoped query goes through the childId index. */
  forChild<T>(table: Table<T>, childId: string): Promise<T[]> {
    return table.where('childId', childId);
  }

  commit(ops: WriteOp[]): Promise<void> {
    return this.db.commit(ops);
  }
}

/** Collects writes so a whole learning event commits atomically. */
export class UnitOfWork {
  readonly ops: WriteOp[] = [];

  put<T>(table: TableName, value: T): this {
    this.ops.push({ table, type: 'put', value });
    return this;
  }

  putAll<T>(table: TableName, values: T[]): this {
    for (const v of values) this.put(table, v);
    return this;
  }

  delete(table: TableName, key: string): this {
    this.ops.push({ table, type: 'delete', key });
    return this;
  }

  /** Values staged for a table (used to preview state before committing). */
  staged<T>(table: TableName): T[] {
    return this.ops.filter((o) => o.table === table && o.type === 'put').map((o) => o.value as T);
  }
}
