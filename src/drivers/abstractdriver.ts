import {
  Driver,
  MigrationQueryResult
} from '../interfaces';

export abstract class CommonDriver<T> implements Driver {
  dbRunner: T;
  migrationTable: string;

  constructor(dbRunner: T, migrationTable = 'migrations') {
    if (!dbRunner) {
      throw Error(`dbRunner can't be null`);
    }
    this.dbRunner = dbRunner;
    const tName = migrationTable.toLocaleLowerCase();
    if (tName !== migrationTable) {
      throw Error(`Migration table ${migrationTable} can't contain upper case`);
    }
    this.migrationTable = tName;
  }

  getSeparator(): () => string {
    return () => '?';
  }

  getDbMigrations(): string {
    return `select * from ${this.migrationTable}`;
  }

  removeAllMigrations(): string {
    return `update ${
        this.migrationTable} set error_if_happened = null where error_if_happened is not null`;
  }

  getFailedMigrations(): string {
    return `select * from ${
        this.migrationTable} where error_if_happened is not null`;
  }

  markExecuted(): string {
    const separator = this.getSeparator();
    return `insert into ${
        this.migrationTable} (name, created, error_if_happened) values (${
        separator()}, ${separator()}, ${separator()})`;
  }

  createUniqueTableIndex(): string {
    return `CREATE UNIQUE INDEX migrations_name_uindex ON ${
        this.migrationTable} (name)`;
  }

  abstract async readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>>;

  async query(sql: string, params: unknown[]): Promise<string | null> {
    const res: MigrationQueryResult<T> = await this.readQuery(sql, params);
    return res.error;
  }

  async executeMultipleStatements(sql: string): Promise<string | null> {
    return await this.query(sql, []);
  }

  abstract isInitedSql(): string;

  abstract createTableSql(): string;

  extractError(e: { message?: string; } | null): string | null {
    if (e) {
      if (e.message) {
        return e.message;
      } else {
        return 'Unknown error';
      }
    } else {
      return null;
    }
  }
}
