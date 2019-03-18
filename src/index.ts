import * as fs from 'fs';
import * as moment from 'moment';
import {Connection, FieldInfo, MysqlError} from 'mysql';
import * as path from 'path';
import {Client, QueryResult} from 'pg';
import {Database} from 'sqlite3';

const colors = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Dim: '\x1b[2m',
  Underscore: '\x1b[4m',
  Blink: '\x1b[5m',
  Reverse: '\x1b[7m',
  Hidden: '\x1b[8m',

  FgBlack: '\x1b[30m',
  FgRed: '\x1b[31m',
  FgGreen: '\x1b[32m',
  FgYellow: '\x1b[33m',
  FgBlue: '\x1b[34m',
  FgMagenta: '\x1b[35m',
  FgCyan: '\x1b[36m',
  FgWhite: '\x1b[37m',

  BgBlack: '\x1b[40m',
  BgRed: '\x1b[41m',
  BgGreen: '\x1b[42m',
  BgYellow: '\x1b[43m',
  BgBlue: '\x1b[44m',
  BgMagenta: '\x1b[45m',
  BgCyan: '\x1b[46m',
  BgWhite: '\x1b[47m'
};

export interface Migration {
  id: number;
  name: string;
  run_on: Date;
  created: Date;
  error_if_happened: string;
}

export interface CommandDescription {
  description: string;
  run: Function;
}

export interface NameCreated {
  name: string;
  created: Date;
}

export interface Config {
  directoryWithScripts: string;
  dateFormat?: string;
  driver: Driver;
}

export interface MigrationQueryResult<T> {
  error: string|null;
  rows: T[];
}

export interface Driver {
  getDbMigrations(): string;

  removeAllMigrations(): string;

  getFailedMigrations(): string;

  markExecuted(): string;

  createUniqueTableIndex(): string;

  query<T>(sql: string, params: unknown[]): Promise<string|null>;

  readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>>;

  isInitedSql(): string;

  createTableSql(): string;

  executeMultipleStatements<T>(sql: string): Promise<string|null>;
}


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
      // prevent bugs like in pgsql
      console.error(`Renaming migration table name to lowercase ${
          colors.FgCyan}${migrationTable}${colors.Reset} -> ${colors.FgCyan}${
          tName}${colors.Reset}`);
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

  async query(sql: string, params: unknown[]): Promise<string|null> {
    const res: MigrationQueryResult<T> = await this.readQuery(sql, params);
    return res.error;
  }

  async executeMultipleStatements(sql: string): Promise<string|null> {
    return await this.query(sql, []);
  }

  abstract isInitedSql(): string;

  abstract createTableSql(): string;
}

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
          error: extractError(err),
          rows: result ? result.rows : [],
        };
        resolve(newVar);
      });
    });
  }
}

export class SQLite3Driver extends CommonDriver<Database> {
  isInitedSql(): string {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name='${
        this.migrationTable}'`;
  }

  async query(sql: string, params: unknown[]): Promise<string|null> {
    return new Promise((resolve) => {
      this.dbRunner.run(sql, params, (error: Error|null) => {
        resolve(extractError(error));
      });
    });
  }

  async executeMultipleStatements<T>(sql: string): Promise<string|null> {
    return new Promise((resolve) => {
      this.dbRunner.exec(sql, (err: Error|null) => {
        resolve(extractError(err));
      });
    });
  }

  async readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>> {
    return new Promise((resolve) => {
      this.dbRunner.all(sql, params, (error: Error, result: T[]) => {
        resolve({error: extractError(error), rows: result});
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
          (error: MysqlError|null, result: T[], fields?: FieldInfo[]) => {
            resolve({error: extractError(error), rows: result});
          });
    });
  }
}


function extractError(e: {message: string;}|null): string|null {
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


export class Migrations {
  driver: Driver;
  directoryWithScripts: string;
  dateFormat: string;

  constructor({directoryWithScripts, dateFormat = 'YYYYMMDDHHmm', driver}:
                  Config) {
    this.driver = driver;
    this.directoryWithScripts = directoryWithScripts;
    this.dateFormat = dateFormat;
  }

  async runSql(sql: string, params: unknown[]): Promise<void> {
    console.log(`runSql ${sql} :${params.join(',')}`);
    const result: string|null = await this.driver.query(sql, params);
    if (result) {
      throw Error(result);
    }
  }

  async readSql<T>(sql: string, params: unknown[]): Promise<T[]> {
    console.log(`readSql ${sql} :${params.join(',')}`);
    const result: MigrationQueryResult<T> =
        await this.driver.readQuery<T>(sql, params);
    if (result.error) {
      throw Error(result.error);
    }
    return result.rows;
  }

  async checkIfExists(): Promise<boolean> {
    console.log('Checking if migration table exists');
    const result: unknown[] =
        await this.readSql<unknown>(this.driver.isInitedSql(), []);
    const isExists = result.length > 0;
    console.log(
        isExists ? 'Migration table exists' : `Migration table doesn't exist`);
    return isExists;
  }

  async doInit(): Promise<void> {
    console.log(`Creating migration table...`);
    await this.runSql(this.driver.createTableSql(), []);
    await this.runSql(this.driver.createUniqueTableIndex(), []);
    console.log(`Migration table has been created`);
  }

  async getScriptStr(script: string): Promise<string> {
    const filePath = path.join(this.directoryWithScripts, script);
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, {encoding: 'utf-8'}, (err, data) => {
        if (err) {
          reject(JSON.stringify(err));
        } else {
          resolve(data);
        }
      });
    });
  }

  async getFilesMigrations(exclude: Migration[]): Promise<NameCreated[]> {
    return new Promise((resolve, reject) => {
      fs.readdir(this.directoryWithScripts, (err, files) => {
        if (err) {
          reject(err.message);
        } else {
          if (exclude) {
            files = files.filter(e => exclude.findIndex(f => f.name === e) < 0);
          }
          let result: NameCreated[] = [];

          files.forEach(
              e => result.push(
                  {name: e, created: moment(e, this.dateFormat).toDate()}));
          result =
              result.sort((a, b) => a.created.getTime() - b.created.getTime());
          resolve(result);
        }
      });
    });
  }

  async runScript(fileName: string, created: Date, failSilently = false) {
    const query: string = await this.getScriptStr(fileName);
    console.log(`Executing ${colors.FgCyan}${fileName}${colors.Reset} ...`);
    const error: string|null =
        await this.driver.executeMultipleStatements(query);
    await this.markExecuted(fileName, created, error);
    if (error && !failSilently) {
      throw Error(error);
    }
  }

  async markExecuted(
      fileName: string, created: Date,
      migrationErr: string|null): Promise<void> {
    if (migrationErr) {
      console.error(`Migration ${colors.FgCyan}${fileName}${
          colors.Reset} failed with error ${colors.FgRed}${migrationErr}${
          colors.Reset}`);
    } else {
      console.log(`${colors.FgGreen}Migration ${colors.FgCyan}${fileName}${
          colors.FgGreen} succeeded${colors.Reset}`);
    }
    await this.runSql(
        this.driver.markExecuted(), [fileName, created, migrationErr]);
  }

  async findNewMigrations(failSilently = false): Promise<NameCreated[]> {
    const completedMigrations = await this.getCompletedMigrations(failSilently);
    return await this.getFilesMigrations(completedMigrations);
  }

  async getDbMigrations(): Promise<Migration[]> {
    return await this.readSql(this.driver.getDbMigrations(), []);
  }

  async getCompletedMigrations(failSilently = false): Promise<Migration[]> {
    const res = await this.getDbMigrations();
    if (!failSilently) {
      res.forEach(r => {
        if (r.error_if_happened) {
          throw Error(
              `Can't start migrations while having a failed one. Run 'resolve' first. Error details: \n${
                  JSON.stringify(r)}`);
        }
      });
    }
    return res;
  }


  async runMigrations(allScript: NameCreated[], failSilently: boolean):
      Promise<void> {
    for (let i = 0; i < allScript.length; i++) {
      await this.runScript(
          allScript[i].name, allScript[i].created, failSilently);
    }
    console.log(`${colors.FgGreen}Migrations finished${colors.Reset}`);
  }

  async markExecutedAll(allScript: NameCreated[]): Promise<void> {
    for (let i = 0; i < allScript.length; i++) {
      await this.markExecuted(allScript[i].name, allScript[i].created, null);
    }
    console.log('All scripts has been marked as executed');
  }


  async getFailedMigrations(): Promise<number> {
    const rows: Migration[] =
        await this.readSql<Migration>(this.driver.getFailedMigrations(), []);
    if (rows.length === 0) {
      console.log('No failed migrations found');
    } else {
      console.log(`Found ${
          rows.length} failed migrations, they will be flagged as resolved:`);
      let result = '';
      rows.forEach(e => {
        result += ` - ${e.name}:\n   Error: ${
            e.error_if_happened}\n   Ran on: ${e.run_on}\n`;
      });
      console.log(result);
    }
    return rows.length;
  }

  async resolveAllMigrations(): Promise<void> {
    const found: number = await this.getFailedMigrations();
    if (found) {
      await this.runSql(this.driver.removeAllMigrations(), []);
      console.log(`${colors.FgGreen}${found} migration(s) marked as resolved${
          colors.Reset}`);
    }
  }
}

export class CommandsRunner extends Migrations {
  commands: {[name: string]: CommandDescription};

  constructor(config: Config) {
    super(config);
    this.commands = {
      init: {
        description: 'Initialized database for migrations',
        run: async () => {
          await this.doInit();
          console.log(`${colors.FgGreen}DB has been successfully initialized${
              colors.Reset}`);
        }
      },
      fake: {
        description: `Fakes the migrations, marks that files in ${
            this.directoryWithScripts} are executed successfully`,
        run: async () => {
          await this.fakeAllScripts();
        }
      },
      list: {
        description:
            `Show all unapplied migrations from ${this.directoryWithScripts}`,
        run: async () => {
          await this.printNewMigrations();
        }
      },
      migrate: {
        description:
            `Installs all new updates from ${this.directoryWithScripts}`,
        run: async () => {
          await this.findAndRunMigrations();
        }
      },
      forceMigrate: {
        description: `Installs all new updates from ${
            this.directoryWithScripts}. If one migration fails it goes to another one.`,
        run: async () => {
          await this.forceRunMigrations();
        }
      },
      resolve: {
        description: `Marks all failed migrations as resolved`,
        run: async () => {
          await this.resolveAllMigrations();
        }
      },
      getFailed: {
        description: `Show all failed migrations`,
        run: async () => {
          await this.getFailedMigrations();
        }

      }
    };
  }


  async run(command: string): Promise<void> {
    console.log(`Running command ${command}`);
    if (this.commands[command]) {
      const inited: boolean = await this.checkIfExists();
      if (!inited && command !== 'init') {
        await this.doInit();
      } else if (inited && command === 'init') {
        throw Error('DB is already initialized');
      }
      await this.commands[command].run();
    } else {
      this.printHelp();
      throw Error(`Invalid command ${command}`);
    }
  }

  printHelp(): void {
    let des = '';
    Object.keys(this.commands).forEach(key => {
      des += `${colors.FgCyan}${key}${colors.Reset}: ${
          this.commands[key].description}\n`;
    });
    console.log(`Available commands are: \n${des}`);
  }

  async findAndRunMigrations(failSilently = false): Promise<void> {
    const newMigrations: NameCreated[] =
        await this.findNewMigrations(failSilently);
    if (newMigrations.length > 0) {
      console.log(`Migrations to run:\n  - ${
          newMigrations.map(e => e.name).join('\n  - ')}`);
      await this.runMigrations(newMigrations, failSilently);
    } else {
      console.log('No new migrations are available');
    }
  }

  async forceRunMigrations() {
    await this.findAndRunMigrations(true);
  }

  async fakeAllScripts() {
    const migrations: NameCreated[] = await this.findNewMigrations();
    this.printMigrations(migrations);
    await this.markExecutedAll(migrations);
  }

  printMigrations(migrations: NameCreated[]): void {
    if (migrations.length > 0) {
      console.log(`New migrations found: \n  - ${
          migrations.map(e => e.name).join('\n  - ')}`);
    } else {
      console.log('No new migrations are available');
    }
  }

  async printNewMigrations(): Promise<void> {
    const res: NameCreated[] = await this.findNewMigrations();
    this.printMigrations(res);
  }
}
