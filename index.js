const fs = require("fs");
const path = require('path');
const moment = require('moment');

class CommonDriver {
    constructor(dbRunner, migrationTable = 'migrations') {
        if (!dbRunner) {
            throw `dbRunner can't be null`;
        }
        this.dbRunner = dbRunner;
        let tName = migrationTable.toLocaleLowerCase();
        if (tName !== migrationTable) {
            //prevent bugs like in pgsql
            console.error(`Renaming migration table name to lowercase ${migrationTable} -> ${tName}`);
        }
        this.migrationTable = tName;
    }

    getDbMigrations() {
        return `select * from ${this.migrationTable}`
    }

    removeAllMigrations() {
        return `update ${this.migrationTable} set error_if_happened = null where error_if_happened is not null`
    }

    markExecuted() {
        return `insert into ${this.migrationTable} (name, created, error_if_happened) values (?, ?, ?)`
    }

    createUniqueTableIndex() {
        return `CREATE UNIQUE INDEX migrations_name_uindex ON ${this.migrationTable} (name)`;
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

class PsqlDriver extends CommonDriver {
    existsSql() {
        return `SELECT 1 FROM information_schema.tables WHERE table_name = '${this.migrationTable}'`;
    }

    markExecuted() {
        return `insert into ${this.migrationTable} (name, created, error_if_happened) values ($1, $2, $3)`
    }

    runSqlError(sql, params, cb) {
        this.dbRunner(sql, params, function(error, result) {
            return cb(error);
        })
    }

    runSql(sql, params, cb) {
        this.dbRunner(sql, params, function(error, result) {
            if (error) {
                throw JSON.stringify(error);
            }
            return cb(result.rows);
        })
    }


}

class MysqlDriver extends CommonDriver {
    existsSql() {
        return `SHOW TABLES LIKE '${this.migrationTable}'`;
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
        this.dbRunner(sql, params, function(error, result, fields) {
            if (error) {
                throw JSON.stringify(error);
            }
            return cb(result);
        })
    }

    runSqlError(sql, params, cb) {
        this.dbRunner(sql, params, function(error, result, fields) {
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
        this.driver.runSql(this.driver.existsSql(), [], (rows) => {
            callback(rows.length > 0);
        });
    }

    doInit(callback) {
        this.driver.runSql(this.driver.createTableSql(), [], () => {
            this.driver.runSql(this.driver.createUniqueTableIndex(), [], () => {
                console.log('DB has been successfully initialized');
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
            console.log(`\n\n\nExecuting ${fileName}:\n`);
            this.driver.runSqlError(query, null, (migrationErr) => {
                migrationErr = migrationErr ? JSON.stringify(migrationErr) : null;
                this.markExecuted(fileName, created, migrationErr, () => {
                    if (migrationErr) {
                        if (failSilently) {
                            console.error(migrationErr);
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
        console.log(`Marking ${fileName} as executed`);
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
        this.driver.runSql(this.driver.getDbMigrations(), [], callback);
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
            console.log("Migrations finished");
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

    resolveAllMigrations(callback) {
        this.driver.runSql(this.driver.removeAllMigrations(), [], (ok) => {
                console.log(`${ok.affectedRows} migrations marked as resolved`);
                callback();
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
            des += `${key}: ${this.commands[key].description}\n`
        });
        console.log(`Available commands are: \n${des}`);
    }

    findAndRunMigrations(callback, failSilently = false) {
        this.findNewMigrations(newMigrations => {
            if (newMigrations.length > 0) {
                console.log(`Migrations to run:\n${newMigrations.map(e => e.name).join('\n')}`);
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
            console.log(`New migrations found: \n${migrations.map(e => e.name).join('\n')}`);
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
    CommandsRunner, Migrations, PsqlDriver, CommonDriver, MysqlDriver
}
