const fs = require("fs");
const path = require('path');
const moment = require('moment');

class Migrations {

    constructor({migrationTable = 'migrations', directoryWithScripts = './diff', dateFormat = 'YYYYMMDDHHmm', dbRunner}) {
        if (!dbRunner) {
            throw `dbRunner can't be null`;
        }
        this.dbRunner = dbRunner;
        this.migrationTable = migrationTable;
        this.directoryWithScripts = directoryWithScripts;
        this.dateFormat = dateFormat;
    }

    checkIfExists(callback) {
        this.dbRunner('SHOW TABLES LIKE ?', [this.migrationTable], (ok, err) => {
            if (err) {
                throw JSON.stringify(err);
            }
            callback(ok.length > 0);
        });
    }

    getCreateTable(migrationName) {
        return `CREATE TABLE ${migrationName}
(
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    error_if_happened LONGTEXT
);
CREATE UNIQUE INDEX migrations_name_uindex ON ${this.migrationTable} (name);
`;
    }

    doInit(callback) {
        this.dbRunner(this.getCreateTable(this.migrationTable), [], (ok, err) => {
            if (err) {
                throw JSON.stringify(err);
            }
            console.log('DB has been successfully initialized');
            callback();
        })
    }

    getScriptStr(script, callback){
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
            files.forEach(e => result.push({name: e, created: moment(e, this.dateFormat).toDate()}));
            result = result.sort((a, b) =>  a.created.getTime() - b.created.getTime());
            callback(result);
        });
    }

    runScript(fileName, created, next, failSilently = false) {
        this.getScriptStr(fileName, query => {
            console.log(`\n\n\nExecuting ${fileName}:\n`);
            this.dbRunner(query, null, (ok, migrationErr) => {
                migrationErr = migrationErr ? JSON.stringify(migrationErr) : null;
                this.markExecuted(fileName, created, migrationErr, ()=> {
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
            })
        })
    }

    markExecuted(fileName, created, migrationErr, callback) {
        console.log(`Marking ${fileName} as executed`);
        this.dbRunner(`insert into ${this.migrationTable} (name, created, error_if_happened) values (?, ?, ?)`,
            [fileName, created, migrationErr], (ok, errReport) => {
                if (errReport) {
                    throw JSON.stringify(errReport);
                } else {
                    callback();
                }
            });
    }

    findNewMigrations(callback, failSilently = false) {
        this.getCompletedMigrations(completedMigrations => {
            this.getFilesMigrations(completedMigrations, newMigrations => {
                callback(newMigrations);
            })
        }, failSilently);
    }

    getDbMigrations(callback) {
        this.dbRunner(`select * from ${this.migrationTable}`, [], (ok, err) => {
            if (err) {
                throw JSON.stringify(err);
            }
            callback(ok);
        });
    }

    getCompletedMigrations(callback, failSilently = false) {
        this.getDbMigrations(res => {
            if (!failSilently) {
                res.forEach(r => {
                    if (r.error_if_happened) {
                        throw `Can't start migrations while having a failed one. Run "resolve" first. Error details: \n${JSON.stringify(r) }`
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
        this.dbRunner(`update ${this.migrationTable} set error_if_happened = null where error_if_happened is not null`, [], (ok, err) =>{
            if (err) {
                throw JSON.stringify(err);
            } else {
                console.log(`${ok.affectedRows} migrations marked as resolved`);
                callback();
            }
        })
    }
}

module.exports = class CommandsRunner extends Migrations {

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
                console.log(`Migrations to run:\n${ newMigrations.map(e => e.name).join('\n')}`);
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
        if (migrations.length > 0 ){
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
        this.checkIfExists( (inited) =>{
            if (inited) {
                throw "DB is already initialized";
            } else {
                this.doInit(callback);
            }
        })
    }
}


