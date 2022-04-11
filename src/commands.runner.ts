import * as fs from 'fs';
import * as moment from 'moment';
import * as path from 'path';
import {
  CommandDescription,
  Config,
  Driver,
  Logger,
  Migration,
  MigrationQueryResult,
  NameCreated
} from './interfaces';
import {ColoredLogger} from './logger';


export class CommandsRunner {
  driver: Driver;
  directoryWithScripts: string;
  dateFormat: string;
  logger: Logger;
  commands: {[name: string]: CommandDescription};


  constructor({
      directoryWithScripts,
      dateFormat = 'YYYYMMDDHHmm',
      driver,
      logger = new ColoredLogger()
    }: Config) {
    this.driver = driver;
    this.logger = logger;
    this.directoryWithScripts = directoryWithScripts;
    this.dateFormat = dateFormat;
    this.commands = {
      init: {
        description: 'Initialized database for migrations',
        run: async() => {
          await this.doInit();
        },
        skipInit: true,
      },
      fake: {
        description: `Fakes the migrations, marks that files in ${
          this.directoryWithScripts} are executed successfully`,
        run: async() => {
          await this.fakeAllScripts();
        }
      },
      list: {
        description:
          `Show all unapplied migrations from ${this.directoryWithScripts}`,
        run: async() => {
          await this.printNewMigrations();
        }
      },
      migrate: {
        description:
          `Installs all new updates from ${this.directoryWithScripts}`,
        run: async() => {
          await this.findAndRunMigrations(false);
        }
      },
      forceMigrate: {
        description: `Installs all new updates from ${
          this.directoryWithScripts}. If one migration fails it goes to another one.`,
        run: async() => {
          await await this.findAndRunMigrations(true);
        }
      },
      resolve: {
        description: `Marks all failed migrations as resolved`,
        run: async() => {
          await this.resolveAllMigrations();
        }
      },
      getFailed: {
        description: `Show all failed migrations`,
        run: async() => {
          await this.getFailedMigrations();
        }
      },
      help: {
        description: `Prints help`,
        run: async() => {
          this.printHelp();
        },
        skipInit: true,
      }
    };
  }

  async runSql(sql: string, params: unknown[]): Promise<void> {
    this.logger.info(`runSql: '${sql}'; arguments: [\'${params.join('\',\'')}']`);
    const result: string | null = await this.driver.query(sql, params);
    if (result) {
      throw Error(result);
    }
  }

  async readSql<T>(sql: string, params: unknown[]): Promise<T[]> {
    this.logger.info(`readSql: '${sql}'; arguments: [\'${params.join('\',\'')}']`);
    const result: MigrationQueryResult<T> =
      await this.driver.readQuery<T>(sql, params);
    if (result.error) {
      throw Error(result.error);
    }
    return result.rows;
  }

  async checkIfExists(): Promise<boolean> {
    this.logger.info('Checking if migration table exists');
    const result: unknown[] =
      await this.readSql<unknown>(this.driver.isInitedSql(), []);
    const isExists = result.length > 0;

    this.logger.info(
      isExists ? 'Migration table exists' : `Migration table doesn't exist`);
    return isExists;
  }

  async doInit(): Promise<void> {
    const exists = await this.checkIfExists();
    if (!exists) {
      this.logger.info(`Creating migration table...`);
      await this.runSql(this.driver.createTableSql(), []);
      await this.runSql(this.driver.createUniqueTableIndex(), []);
      this.logger.success('DB has been successfully initialized');
    } else {
      this.logger.info('Db already exists');
    }
  }

  async getScriptStr(script: string): Promise<string> {
    const filePath = path.join(this.directoryWithScripts, script);
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, {encoding: 'utf-8'}, (err: NodeJS.ErrnoException | null, data: string) => {
        if (err) {
          reject(err.message);
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

  async runScript(fileName: string, created: Date, failSilently: boolean) {
    const query: string = await this.getScriptStr(fileName);
    this.logger.infoParams('Executing {} ...', fileName);
    const error: string | null =
      await this.driver.executeMultipleStatements(query);
    await this.markExecuted(fileName, created, error);
    if (error && !failSilently) {
      throw Error(error);
    }
  }

  async markExecuted(
    fileName: string, created: Date,
    migrationErr: string | null): Promise<void> {
    if (migrationErr) {
      this.logger.infoParamsColor('Migration {} failed with error {}', {
        param: fileName,
        color: this.logger.colors.FgCyan
      }, {param: migrationErr, color: this.logger.colors.FgRed});
    } else {
      this.logger.infoParams('Migration {} succeeded', fileName);
    }
    await this.runSql(
      this.driver.markExecuted(), [fileName, created, migrationErr]);
  }

  async findNewMigrations(failSilently: boolean): Promise<NameCreated[]> {
    const completedMigrations = await this.getCompletedMigrations(failSilently);
    return await this.getFilesMigrations(completedMigrations);
  }

  async getDbMigrations(): Promise<Migration[]> {
    return await this.readSql(this.driver.getDbMigrations(), []);
  }

  async getCompletedMigrations(failSilently: boolean): Promise<Migration[]> {
    const res: Migration[] = await this.getDbMigrations();
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
    this.logger.success('Migrations finished');
  }

  async markExecutedAll(allScript: NameCreated[]): Promise<void> {
    for (let i = 0; i < allScript.length; i++) {
      await this.markExecuted(allScript[i].name, allScript[i].created, null);
    }
    this.logger.info('All scripts has been marked as executed');
  }


  async getFailedMigrations(): Promise<number> {
    const rows: Migration[] =
      await this.readSql<Migration>(this.driver.getFailedMigrations(), []);
    if (rows.length === 0) {
      this.logger.info('No failed migrations found');
    } else {
      this.logger.info(`Found ${rows.length} failed migrations, they will be flagged as resolved:`);
      let result = '';
      rows.forEach(e => {
        result += ` - ${e.name}:\n   Error: ${
          e.error_if_happened}\n   Ran on: ${e.run_on}\n`;
      });
      this.logger.info(result);
    }
    return rows.length;
  }

  async resolveAllMigrations(): Promise<void> {
    const found: number = await this.getFailedMigrations();
    if (found) {
      await this.runSql(this.driver.removeAllMigrations(), []);
      this.logger.info(`${found} migration(s) marked as resolved`);
    }
  }

  async run(command: 'init' | 'fake' | 'list' | 'migrate' | 'forceMigrate' | 'resolve' | 'getFailed' | 'help'): Promise<void> {

    this.logger.info(`Running command ${command}`);
    const c = this.commands[command];
    if (c) {
      if (!c.skipInit) {
        const inited: boolean = await this.checkIfExists();
        if (!inited) {
          throw Error('Db is not initialized');
        }
      }
      await c.run();
    } else {
      this.printHelp();
      throw Error(`Invalid command ${command}`);
    }
  }

  printHelp(): void {
    let des = '';
    Object.keys(this.commands).forEach(key => {
      des += `${this.logger.colors.FgCyan}${key}${this.logger.colors.Reset}: ${
        this.commands[key].description}\n`;
    });
    this.logger.info(`Available commands are: \n${des}`);
  }

  async findAndRunMigrations(failSilently: boolean): Promise<void> {
    const newMigrations: NameCreated[] = await this.findNewMigrations(failSilently);
    this.printMigrations(newMigrations);
    await this.runMigrations(newMigrations, failSilently);
  }

  async fakeAllScripts() {
    const migrations: NameCreated[] = await this.findNewMigrations(false);
    this.printMigrations(migrations);
    await this.markExecutedAll(migrations);
  }

  printMigrations(migrations: NameCreated[]): void {
    if (migrations.length > 0) {
      this.logger.info(`New migrations found: \n  - ${
        migrations.map(e => e.name).join('\n  - ')}`);
    } else {
      this.logger.info('No new migrations are available');
    }
  }

  async printNewMigrations(): Promise<void> {
    const res: NameCreated[] = await this.findNewMigrations(false);
    this.printMigrations(res);
  }
}
