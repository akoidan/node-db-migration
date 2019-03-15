const fs = require("fs");
const path = require('path');
const moment = require('moment');


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


class CommonDriver {
    constructor(dbRunner, migrationTable = 'migrations') {
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

    getDbMigrations() {
        return `select * from ${this.migrationTable}`
    }

    removeAllMigrations() {
        return `update ${this.migrationTable} set error_if_happened = null where error_if_happened is not null`
    }

    getFailedMigrations() {
        return `select * from ${this.migrationTable} where error_if_happened is not null`
    }

    markExecuted() {
        return `insert into ${this.migrationTable} (name, created, error_if_happened) values (?, ?, ?)`
    }

    createUniqueTableIndex() {
        return `CREATE UNIQUE INDEX migrations_name_uindex ON ${this.migrationTable} (name)`;
    }

}

class PsqlDriver extends CommonDriver {

    isInitedSql(cb) {
        return `SELECT 1 FROM information_schema.tables WHERE table_name = '${this.migrationTable}'`;
    }

    markExecuted() {
        return `insert into ${this.migrationTable} (name, created, error_if_happened) values ($1, $2, $3)`
    }

    runSqlError(sql, params, cb) {
        this.dbRunner.query(sql, params, function(error, result) {
            return cb(error);
        })
    }

    readSql(sql, params, cb) {
        this.runSql(sql, params, cb);
    }

    runSql(sql, params, cb) {
        this.dbRunner.query(sql, params, function(error, result) {
            if (error) {
                throw JSON.stringify(error);
            }
            return cb(result.rows);
        })
    }

    createTableSql() {
        return `CREATE TABLE ${this.migrationTable}
(
    id bigserial PRIMARY KEY ,
    name VARCHAR(128) NOT NULL,
    run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    error_if_happened text
)`;
    }


}

class SQLite3Driver extends CommonDriver {

    isInitedSql() {
        return `SELECT name FROM sqlite_master WHERE type='table' AND name='${this.migrationTable}'`;
    }

    readSql(sql, params, cb) {
        this.dbRunner.all(sql, params, function(error, result) {
            if (error) {
                throw error && error.message;
            }
            return cb(result || []);
        })
    }


    createTableSql() {
        return `CREATE TABLE ${this.migrationTable}
(
    id INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(128) NOT NULL,
    run_on DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    error_if_happened text
) `;
    }

    runSql(sql, params, cb) {
        this.dbRunner.run(sql, params, function(error, result) {
            if (error) {
                throw error && error.message;
            }
            return cb(result || []);
        })
    }

    runSqlError(sql, params, cb) {
        this.dbRunner.run(sql, params, function(error, result) {
            return cb(error && error.message);
        })
    }

}

class MysqlDriver extends CommonDriver {

    isInitedSql() {
        return `SHOW TABLES LIKE '${this.migrationTable}'`;
    }

    readSql(sql, params, cb) {
        this.runSql(sql, params, cb);
    }


    createTableSql() {
        return `CREATE TABLE ${this.migrationTable}
(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    error_if_happened LONGTEXT
) `;
    }

    runSql(sql, params, cb) {
        this.dbRunner.query(sql, params, function(error, result, fields) {
            if (error) {
                throw JSON.stringify(error);
            }
            return cb(result);
        })
    }

    runSqlError(sql, params, cb) {
        this.dbRunner.query(sql, params, function(error, result, fields) {
            return cb(error);
        })
    }

}

class Migrations {

    constructor({directoryWithScripts, dateFormat = 'YYYYMMDDHHmm', driver}) {
        this.driver = driver;
        this.directoryWithScripts = directoryWithScripts;
        this.dateFormat = dateFormat;
    }

    checkIfExists(callback) {
        this.driver.readSql(this.driver.isInitedSql(), [], (rows) => {
            callback(rows.length > 0);
        });
    }

    doInit(callback) {
        console.log(`Creating migration table...`);
        this.driver.runSql(this.driver.createTableSql(), [], () => {
            this.driver.runSql(this.driver.createUniqueTableIndex(), [], () => {
                console.log(`${colors.FgGreen}DB has been successfully initialized${colors.Reset}`);
                callback();
            });
        });
    }

    getScriptStr(script, callback) {
        let filePath = path.join(this.directoryWithScripts, script);
        fs.readFile(filePath, {encoding: 'utf-8'}, (err, data) => {
            if (err) {
                throw JSON.stringify(err);
            } else {
                callback(data);
            }
        });
    }

    getFilesMigrations(exclude, callback) {
        fs.readdir(this.directoryWithScripts, (err, files) => {
            if (err) {
                throw JSON.stringify(err);
            }
            if (exclude) {
                files = files.filter(e => exclude.findIndex(f => f.name == e) < 0);
            }
            let result = [];
            files.forEach(e => result.push({
                name: e,
                created: moment(e, this.dateFormat).toDate()
            }));
            result = result.sort((a, b) => a.created.getTime() - b.created.getTime());
            callback(result);
        });
    }

    runScript(fileName, created, next, failSilently = false) {
        this.getScriptStr(fileName, query => {
            console.log(`Executing ${colors.FgCyan}${fileName}${colors.Reset} ...`);
            this.driver.runSqlError(query, [], (migrationErr) => {
                migrationErr = migrationErr ? JSON.stringify(migrationErr) : null;
                this.markExecuted(fileName, created, migrationErr, () => {
                    if (migrationErr) {
                        if (failSilently) {
                            next();
                        } else {
                            throw migrationErr;
                        }
                    } else {
                        next();
                    }
                })
            });
        })
    }

    markExecuted(fileName, created, migrationErr, callback) {
        if (migrationErr) {
            console.error(`Migration ${colors.FgCyan}${fileName}${colors.Reset} failed with error ${colors.FgRed}${migrationErr}${colors.Reset}`);
        } else {
            console.log(`${colors.FgGreen}Migration ${colors.FgCyan}${fileName}${colors.FgGreen} succeeded${colors.Reset}`);
        }
        this.driver.runSql(this.driver.markExecuted(), [fileName, created, migrationErr], callback);
    }

    findNewMigrations(callback, failSilently = false) {
        this.getCompletedMigrations(completedMigrations => {
            this.getFilesMigrations(completedMigrations, newMigrations => {
                callback(newMigrations);
            })
        }, failSilently);
    }

    getDbMigrations(callback) {
        this.driver.readSql(this.driver.getDbMigrations(), [], callback);
    }

    getCompletedMigrations(callback, failSilently = false) {
        this.getDbMigrations(res => {
            if (!failSilently) {
                res.forEach(r => {
                    if (r.error_if_happened) {
                        throw `Can't start migrations while having a failed one. Run "resolve" first. Error details: \n${JSON.stringify(r)}`
                    }
                });
            }
            callback(res);
        });
    }


    runMigrations(allScript, failSilently, callback, current = 0) {
        if (allScript[current]) {
            this.runScript(allScript[current].name, allScript[current].created, () => {
                this.runMigrations(allScript, failSilently, callback, current + 1);
            }, failSilently)
        } else {
            console.log(`${colors.FgGreen}Migrations finished${colors.Reset}`);
            callback();
        }
    }

    markExecutedAll(allScript, callback, current = 0) {
        if (allScript[current]) {
            this.markExecuted(allScript[current].name, allScript[current].created, null, () => {
                this.markExecutedAll(allScript, callback, current + 1);
            })
        } else {
            console.log("All scripts has been marked as executed");
            callback();
        }
    }


    getFailedMigrations(cb) {
        this.driver.readSql(this.driver.getFailedMigrations(), [], (rows) => {
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
            cb(rows.length)
        })
    }

    resolveAllMigrations(callback) {
        this.getFailedMigrations(found => {
            if (found) {
                this.driver.runSql(this.driver.removeAllMigrations(), [], (ok) => {
                    console.log(`${colors.FgGreen}${found} migration(s) marked as resolved${colors.Reset}`);
                    callback();
                })
            }
        })
    }
}

class CommandsRunner extends Migrations {

    constructor(config) {
        super(config);
        this.commands = {
            init: {
                description: "Initialized database for migrations",
                run: this.init
            },
            fake: {
                description: `Fakes the migrations, marks that files in ${this.directoryWithScripts} are executed successfully`,
                run: this.fakeAllScripts
            },
            list: {
                description: `Show all unapplied migrations from ${this.directoryWithScripts}`,
                run: this.printNewMigrations
            },
            migrate: {
                description: `Installs all new updates from ${this.directoryWithScripts}`,
                run: this.findAndRunMigrations
            },
            forceMigrate: {
                description: `Installs all new updates from ${this.directoryWithScripts}. If one migration fails it goes to another one.`,
                run: this.forceRunMigrations
            },
            resolve: {
                description: `Marks all failed migrations as resolved`,
                run: this.resolveAllMigrations
            },
            getFailed: {
                description: `Show all failed migrations`,
                run: this.getFailedMigrations
            }
        };
    }


    run(command) {
        if (this.commands[command]) {
            this.checkIfExists(inited => {
                if (!inited && command !== 'init') {
                    this.doInit(() => {
                        this.commands[command].run.bind(this)(() => process.exit());
                    });
                } else {
                    this.commands[command].run.bind(this)(() => process.exit());
                }
            });
        } else {
            this.printHelp();
            throw `Invalid command ${command}`;
        }
    }

    printHelp() {
        let des = '';
        Object.keys(this.commands).forEach(key => {
            des += `${colors.FgCyan}${key}${colors.Reset}: ${this.commands[key].description}\n`
        });
        console.log(`Available commands are: \n${des}`);
    }

    findAndRunMigrations(callback, failSilently = false) {
        this.findNewMigrations(newMigrations => {
            if (newMigrations.length > 0) {
                console.log(`Migrations to run:\n  - ${newMigrations.map(e => e.name).join('\n  - ')}`);
                this.runMigrations(newMigrations, failSilently, callback);
            } else {
                console.log("No new migrations are available");
                callback();
            }
        }, failSilently);
    }

    forceRunMigrations(callback) {
        this.findAndRunMigrations(callback, true);
    }

    fakeAllScripts(callback) {
        this.findNewMigrations(migrations => {
            this.printMigrations(migrations);
            this.markExecutedAll(migrations, callback);
        })
    }

    printMigrations(migrations) {
        if (migrations.length > 0) {
            console.log(`New migrations found: \n  - ${migrations.map(e => e.name).join('\n  - ')}`);
        } else {
            console.log("No new migrations are available");
        }
    }

    printNewMigrations(callback) {
        this.findNewMigrations(res => {
            this.printMigrations(res);
            callback();
        })
    }

    init(callback) {
        this.checkIfExists((inited) => {
            if (inited) {
                throw "DB is already initialized";
            } else {
                this.doInit(callback);
            }
        })
    }
}

module.exports = {
    CommandsRunner, Migrations, PsqlDriver, CommonDriver, MysqlDriver, SQLite3Driver
}
