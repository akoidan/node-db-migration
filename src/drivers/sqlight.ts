import {Database} from 'sqlite3';
import {CommonDriver} from './abstractdriver';
import {MigrationQueryResult} from '../interfaces';

export class SQLite3Driver extends CommonDriver<Database> {
  isInitedSql(): string {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name='${
        this.migrationTable}'`;
  }

  async query(sql: string, params: unknown[]): Promise<string | null> {
    return new Promise((resolve) => {
      this.dbRunner.run(sql, params, (error: Error | null) => {
        resolve(this.extractError(error));
      });
    });
  }

  async executeMultipleStatements<T>(sql: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.dbRunner.exec(sql, (err: Error | null) => {
        resolve(this.extractError(err));
      });
    });
  }

  async readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>> {
    return new Promise((resolve) => {
      this.dbRunner.all(sql, params, (error: Error, result: T[]) => {
        resolve({error: this.extractError(error), rows: result});
      });
    });
  }


  createTableSql(): string {
    return `CREATE TABLE ${this.migrationTable}` +
        `(` +
        `    id INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT ,` +
        `    name VARCHAR(128) NOT NULL,` +
        `    run_on DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
        `    created DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
        `    error_if_happened text` +
        `)`;
  }
}
