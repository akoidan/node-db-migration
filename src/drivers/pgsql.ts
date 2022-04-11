import {
  Client,
  QueryResult
} from 'pg';
import {CommonDriver} from './abstractdriver';
import {MigrationQueryResult} from '../interfaces';

export class PsqlDriver extends CommonDriver<Client> {
  isInitedSql(): string {
    return `SELECT 1 FROM information_schema.tables WHERE table_name = '${
        this.migrationTable}'`;
  }

  getSeparator(): () => string {
    let i = 0;
    return () => {
      i++;
      return `$${i}`;
    };
  }

  createTableSql(): string {
    return `CREATE TABLE ${this.migrationTable}` +
        `(` +
        `    id bigserial PRIMARY KEY ,` +
        `    name VARCHAR(128) NOT NULL,` +
        `    run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
        `    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
        `    error_if_happened text` +
        `)`;
  }

  async readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>> {
    return new Promise((resolve) => {
      this.dbRunner.query(sql, params, (err: Error, result: QueryResult) => {
        const newVar: MigrationQueryResult<T> = {
          error: this.extractError(err),
          rows: result ? result.rows : [],
        };
        resolve(newVar);
      });
    });
  }
}
