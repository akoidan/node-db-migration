import * as fs from "fs";
import * as path from "path";
import * as moment from "moment";


var colors = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",

    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgGreen: "\x1b[32m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",

    BgBlack: "\x1b[40m",
    BgRed: "\x1b[41m",
    BgGreen: "\x1b[42m",
    BgYellow: "\x1b[43m",
    BgBlue: "\x1b[44m",
    BgMagenta: "\x1b[45m",
    BgCyan: "\x1b[46m",
    BgWhite: "\x1b[47m"
}

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
    name: string,
    created: Date;
}

export interface Config {
    directoryWithScripts: string,
    dateFormat?: string,
    driver: Driver;
}

export interface QueryResult {
    error: string;
    rows: any[];
}

export interface Driver {

    getDbMigrations(): string;

    removeAllMigrations(): string;

    getFailedMigrations(): string;

    markExecuted(): string;

    createUniqueTableIndex(): string;

    query(sql: string, params: any[]): Promise<QueryResult>;

    readQuery(sql: string, params: any[]): Promise<QueryResult>;

    isInitedSql(): string;

    createTableSql(): string;
}



export class CommonDriver implements Driver {

    dbRunner: any;
    migrationTable: string;

    constructor(dbRunner: any, migrationTable: string = 'migrations') {
        if (!dbRunner) {
            throw `dbRunner can't be null`;
        }
        this.dbRunner = dbRunner;
        let tName = migrationTable.toLocaleLowerCase();
        if (tName !== migrationTable) {
            //prevent bugs like in pgsql
            console.error(`Renaming migration table name to lowercase ${colors.FgCyan}${migrationTable}${colors.Reset} -> ${colors.FgCyan}${tName}${colors.Reset}`);
        }
        this.migrationTable = tName;
    }

    getSeparator(): () => string {
        return () => '?';
    }

    getDbMigrations(): string {
        return `select * from ${this.migrationTable}`
    }

    removeAllMigrations(): string {
        return `update ${this.migrationTable} set error_if_happened = null where error_if_happened is not null`
    }

    getFailedMigrations(): string {
        return `select * from ${this.migrationTable} where error_if_happened is not null`
    }

    markExecuted(): string {
        let separator = this.getSeparator();
        return `insert into ${this.migrationTable} (name, created, error_if_happened) values (${separator()}, ${separator()}, ${separator()})`
    }

    createUniqueTableIndex(): string {
        return `CREATE UNIQUE INDEX migrations_name_uindex ON ${this.migrationTable} (name)`;
    }

    async query(sql: string, params: any[]): Promise<QueryResult> {
        throw 'Unimplemented';
    }

    async readQuery(sql: string, params: any[]): Promise<QueryResult> {
        return await this.query(sql, params);
    }

    isInitedSql(): string {
        throw 'Unimplemented';
    }

    createTableSql(): string {
        throw 'Unimplemented';
    }

}

export class PsqlDriver extends CommonDriver {

    isInitedSql(): string {
        return `SELECT 1 FROM information_schema.tables WHERE table_name = '${this.migrationTable}'`;
    }

    getSeparator(): () => string {
        let i = 0;
        return () => {
            i++;
            return `$${i}`;
        };
    }

    async query(sql: string, params: any[]): Promise<QueryResult> {
        return new Promise((resolve, reject) => {
            this.dbRunner.query(sql, params, (error: any, result: any) => {
                resolve({
                    error: error && error.message ? error.message : error,
                    rows: result && result.rows
                })
            })
        })
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


}

export class SQLite3Driver extends CommonDriver {

    isInitedSql(): string {
        return `SELECT name FROM sqlite_master WHERE type='table' AND name='${this.migrationTable}'`;
    }

    async query(sql: string, params: any[]): Promise<QueryResult> {
        return new Promise((resolve, reject) => {
            this.dbRunner.run(sql, params, (error: any, result: any) => {
                resolve({
                    error: error && error.message ? error.message : error,
                    rows: result
                })
            })
        })
    }

    async readQuery(sql: string, params: any[]): Promise<QueryResult> {
        return new Promise((resolve, reject) => {
            this.dbRunner.all(sql, params, (error: any, result: any) => {
                resolve({
                    error: error && error.message ? error.message : error,
                    rows: result
                })
            })
        })
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

export class MysqlDriver extends CommonDriver {

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

    async query(sql: string, params: any[]): Promise<QueryResult> {
        return new Promise((resolve, reject) => {
            this.dbRunner.query(sql, params, (error: any, result: any) => {
                resolve({
                    error: error && error.message ? error.message : error,
                    rows: result
                })
            })
        })
    }

}


export class Migrations {

    driver: Driver;
    directoryWithScripts: string;
    dateFormat: string;

    constructor({directoryWithScripts, dateFormat = 'YYYYMMDDHHmm', driver}: Config) {
        this.driver = driver;
        this.directoryWithScripts = directoryWithScripts;
        this.dateFormat = dateFormat;
    }

    async runSql(sql: string, params: any[]): Promise<any[]> {
        console.log(`runSql ${sql} :${params.join(',')}`)
        let result: QueryResult = await this.driver.query(sql, params);
        if (result.error) {
            throw JSON.stringify(result.error);
        }
        return result.rows;
    }

    async readSql(sql: string, params: any[]): Promise<any[]> {
        console.log(`readSql ${sql} :${params.join(',')}`)
        let result: QueryResult = await this.driver.readQuery(sql, params);
        if (result.error) {
            throw JSON.stringify(result.error);
        }
        return result.rows;
    }

    async checkIfExists(): Promise<boolean> {
        console.log("Checking if migration table exists");
        let result: any[] = await this.readSql(this.driver.isInitedSql(), []);
        let isExists = result.length > 0;
        console.log(isExists ? 'Migration table exists' : `Migration table doesn't exist`);
        return isExists;
    }

    async doInit(): Promise<void> {
        console.log(`Creating migration table...`);
        await this.runSql(this.driver.createTableSql(), []);
        await this.runSql(this.driver.createUniqueTableIndex(), []);
        console.log(`Migration table has been created`);
    }

    async getScriptStr(script: string): Promise<string> {
        let filePath = path.join(this.directoryWithScripts, script);
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, {encoding: 'utf-8'}, (err, data) => {
                if (err) {
                    reject(JSON.stringify(err))
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
                        files = files.filter(e => exclude.findIndex(f => f.name == e) < 0);
                    }
                    let result: NameCreated[] = [];

                    files.forEach(e => result.push({
                        name: e,
                        created: moment(e, this.dateFormat).toDate()
                    }));
                    result = result.sort((a, b) => a.created.getTime() - b.created.getTime());
                    resolve(result);
                }
            });
        });
    }

    async runScript(fileName: string, created: Date, failSilently = false) {
        let query: string = await this.getScriptStr(fileName);
        console.log(`Executing ${colors.FgCyan}${fileName}${colors.Reset} ...`);
        let result: QueryResult = await this.driver.query(query, []);
        await this.markExecuted(fileName, created, result.error);
        if (result.error && !failSilently) {
            throw result.error;
        }
    }

    async markExecuted(fileName: string, created: Date, migrationErr: string): Promise<void> {
        if (migrationErr) {
            console.error(`Migration ${colors.FgCyan}${fileName}${colors.Reset} failed with error ${colors.FgRed}${migrationErr}${colors.Reset}`);
        } else {
            console.log(`${colors.FgGreen}Migration ${colors.FgCyan}${fileName}${colors.FgGreen} succeeded${colors.Reset}`);
        }
        await this.runSql(this.driver.markExecuted(), [fileName, created, migrationErr]);
    }

    async findNewMigrations(failSilently = false): Promise<NameCreated[]> {
        let completedMigrations = await this.getCompletedMigrations(failSilently);
        return await this.getFilesMigrations(completedMigrations);
    }

    async getDbMigrations(): Promise<Migration[]> {
        return await this.readSql(this.driver.getDbMigrations(), []);
    }

    async getCompletedMigrations(failSilently = false): Promise<Migration[]> {
        let res = await this.getDbMigrations();
        if (!failSilently) {
            res.forEach(r => {
                if (r.error_if_happened) {
                    throw `Can't start migrations while having a failed one. Run "resolve" first. Error details: \n${JSON.stringify(r)}`
                }
            });
        }
        return res;
    }


    async runMigrations(allScript: NameCreated[], failSilently: boolean): Promise<void> {
        for (let i = 0; i < allScript.length; i++) {
            await this.runScript(allScript[i].name, allScript[i].created, failSilently);
        }
        console.log(`${colors.FgGreen}Migrations finished${colors.Reset}`);
    }

    async markExecutedAll(allScript: NameCreated[]): Promise<void> {
        for (let i = 0; i < allScript.length; i++) {
            await this.markExecuted(allScript[i].name, allScript[i].created, null);
        }
        console.log("All scripts has been marked as executed");
    }


    async getFailedMigrations(): Promise<number> {
        let rows: any[] = await this.readSql(this.driver.getFailedMigrations(), []);
        if (rows.length === 0) {
            console.log("No failed migrations found")
        } else {
            console.log(`Found ${rows.length} failed migrations, they will be flagged as resolved:`);
            let result = "";
            rows.forEach(e => {
                result += ` - ${e.name}:\n   Error: ${e.error_if_happened}\n   Ran on: ${e.run_on}\n`
            });
            console.log(result);
        }
        return rows.length;
    }

    async resolveAllMigrations(): Promise<void> {
        let found: number = await this.getFailedMigrations();
        if (found) {
            await this.runSql(this.driver.removeAllMigrations(), []);
            console.log(`${colors.FgGreen}${found} migration(s) marked as resolved${colors.Reset}`);
        }
    }
}

export class CommandsRunner extends Migrations {

    commands: { [name: string]: CommandDescription };

    constructor(config: Config) {
        super(config);
        this.commands = {
            init: {
                description: "Initialized database for migrations",
                run: async () => {
                    await this.doInit();
                    console.log(`${colors.FgGreen}DB has been successfully initialized${colors.Reset}`);
                }
            },
            fake: {
                description: `Fakes the migrations, marks that files in ${this.directoryWithScripts} are executed successfully`,
                run: async () => {
                    await this.fakeAllScripts();
                }
            },
            list: {
                description: `Show all unapplied migrations from ${this.directoryWithScripts}`,
                run: async () => {
                    await this.printNewMigrations();
                }
            },
            migrate: {
                description: `Installs all new updates from ${this.directoryWithScripts}`,
                run: async () => {
                    await this.findAndRunMigrations();
                }
            },
            forceMigrate: {
                description: `Installs all new updates from ${this.directoryWithScripts}. If one migration fails it goes to another one.`,
                run: async () => {
                    await this.forceRunMigrations()
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
            let inited: boolean = await this.checkIfExists();
            if (!inited && command !== 'init') {
                await this.doInit();
            } else if (inited && command == 'init') {
                throw "DB is already initialized";
            }
            await this.commands[command].run();
        } else {
            this.printHelp();
            throw `Invalid command ${command}`;
        }
    }

    printHelp(): void {
        let des = '';
        Object.keys(this.commands).forEach(key => {
            des += `${colors.FgCyan}${key}${colors.Reset}: ${this.commands[key].description}\n`
        });
        console.log(`Available commands are: \n${des}`);
    }

    async findAndRunMigrations(failSilently = false): Promise<void> {
        let newMigrations: NameCreated[] = await this.findNewMigrations(failSilently);
        if (newMigrations.length > 0) {
            console.log(`Migrations to run:\n  - ${newMigrations.map(e => e.name).join('\n  - ')}`);
            await this.runMigrations(newMigrations, failSilently);
        } else {
            console.log("No new migrations are available");
        }
    }

    async forceRunMigrations() {
        await this.findAndRunMigrations(true);
    }

    async fakeAllScripts() {
        let migrations: NameCreated[] = await this.findNewMigrations();
        this.printMigrations(migrations);
        await this.markExecutedAll(migrations);
    }

    printMigrations(migrations: NameCreated[]): void {
        if (migrations.length > 0) {
            console.log(`New migrations found: \n  - ${migrations.map(e => e.name).join('\n  - ')}`);
        } else {
            console.log("No new migrations are available");
        }
    }

    async printNewMigrations(): Promise<void> {
        let res: NameCreated[] = await this.findNewMigrations();
        this.printMigrations(res);
    }

}
