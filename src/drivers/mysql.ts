import {
  Connection,
  FieldInfo,
  MysqlError
} from 'mysql';
import {CommonDriver} from './abstractdriver';
import {MigrationQueryResult} from '../interfaces';



export class MysqlDriver extends CommonDriver<Connection> {
  isInitedSql(): string {
    return `SHOW TABLES LIKE '${this.migrationTable}'`;
  }

  createTableSql(): string {
    return `CREATE TABLE ${this.migrationTable}` +
        `(` +
        `    id INT PRIMARY KEY AUTO_INCREMENT,` +
        `    name VARCHAR(128) NOT NULL,` +
        `    run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
        `    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
        `    error_if_happened LONGTEXT` +
        `)`;
  }

  async readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>> {
    return new Promise((resolve) => {
      this.dbRunner.query(
          sql, params,
          (error: MysqlError | null, result: T[], fields?: FieldInfo[]) => {
            resolve({error: this.extractError(error), rows: result});
          });
    });
  }
}
