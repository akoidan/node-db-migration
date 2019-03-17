'use strict';

import {assert, expect, use} from 'chai';
import {CommandsRunner, MysqlDriver} from '../src'
import * as chaiAsPromised from "chai-as-promised";
import * as mysql from 'mysql'
import {Connection} from "mysql";

use(chaiAsPromised);

const DB_NAME = 'node_db_migration_test';

function runSql(driver): (sql: string, params: any[]) => Promise<any> {
    return async (sql, params = []) => {
        return new Promise((resolve, reject) => {
            driver.query(sql, params, (err, res) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(res);
                }
            })
        });
    }
}

async function closeConnection(driver) {
    return new Promise((resolve, reject) => {
        driver.end((err) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        });
    });
}

async function connectDriver(driver) {
    await new Promise((resolve, reject) => {
        driver.connect(function (err) {
            if (err) {
                reject(err)
            } else {
                resolve();
            }
        });
    });
}

function recreateDb(driver) {
    let runner = runSql(driver);
    return async () => {
        await runner(`drop database if exists ${DB_NAME}`, []);
        await runner(`create database ${DB_NAME}`, []);
    }
}

async function mySqlTest() {

    let dbCreator: Connection = mysql.createConnection({
        "host": "localhost",
        "user": "root",
        "multipleStatements": true, // if you have multiple sql in your scripts
    });
    await connectDriver(dbCreator);
    let createDb = recreateDb(dbCreator);
    await createDb();
    let migrationRunner: Connection = mysql.createConnection({
        "host": "localhost",
        "user": "root",
        "database": DB_NAME,
        "multipleStatements": true, // if you have multiple sql in your scripts
    });
    await connectDriver(migrationRunner);

    let sqlRunner = runSql(migrationRunner);

    describe('mysql', async () => {
        beforeEach(async function () {
            await createDb()
        });
        after(async function () {
            await runSql(dbCreator)(`drop database ${DB_NAME}`);
            await Promise.all([
                closeConnection(dbCreator),
                closeConnection(migrationRunner)
            ]);
        });
        it('init should work', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/diff',
            });
            await commandsRunner.run('init')
            let tableNames = await sqlRunner(`show tables like 'migrations'`, []);
            expect(tableNames, "Migration table doesn't exist").to.have.length(1);
        })
        it('init should fail if already inited', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/diff',
            });
            await commandsRunner.run('init');
            await assert.isRejected(commandsRunner.run('init'), 'DB is already initialized');
        })
        it('fake should work', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/fake',
            });
            await sqlRunner('CREATE TABLE pet (name VARCHAR(20))', [])
            await commandsRunner.run('fake');
            let pets = await sqlRunner('select * from pet', [])
            let migrations = await sqlRunner('select * from migrations', []);
            expect(migrations, "Migration should exist").to.have.length(1);
            expect(migrations[0].name, 'Migration name should be ').to.be.equal("1-insert.sql");
            expect(migrations[0].error_if_happened, 'Migration should be without error').to.be.null
            expect(pets, "Pets should be empty").to.be.empty;
        })
        it('find new migrations should return all migration when db is empty', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/list',
            });
            await commandsRunner.run('init');
            let migrations = await commandsRunner.findNewMigrations();
            expect(migrations[0].name, "First migration is 1").to.be.equal('1-insert.sql');
            expect(migrations[1].name, "Second migration is 2").to.be.equal('2-insert.sql');
        })
        it('Should print only 2nd migration when 1st is exected', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/list',
            });
            await commandsRunner.run('init');
            await sqlRunner('insert into migrations (name, run_on, created, error_if_happened) values (?, ?, ?, ?)', ['1-insert.sql', Date.now(), new Date(1), null]);
            let migrations = await commandsRunner.findNewMigrations();
            expect(migrations, "Exactly 1 unapplied migration should exist").to.have.length(1);
            expect(migrations[0].name, "First migration is 2").to.be.equal('2-insert.sql');
        })
        it('Migration with error should save it', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/migrate-fail',
            });
            await assert.isRejected(commandsRunner.run('migrate'));
            let migrations = await sqlRunner('select * from migrations', []);
            expect(migrations, "Should have 1 migration").to.have.length(1);
            expect(migrations[0].name, "Should migrate pet").to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, 'Migration should contain error').to.not.be.null
        })
        it('Should run one and fail another', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/migrate-fail-multiple',
            });
            await assert.isRejected(commandsRunner.run('migrate'));
            let migrations = await sqlRunner('select * from migrations', []);
            expect(migrations, "Should have 2 migrations").to.have.length(2);
            expect(migrations[0].name, "Should executed 1st migration").to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, 'Migration should be w/o error').to.be.null
            expect(migrations[1].name, "Should executed 2nd migration").to.be.equal('2-insert.sql');
            expect(migrations[1].error_if_happened, 'Migration should be w/ error').to.not.be.null
            let pets = await sqlRunner('select * from pet', [])
            expect(pets, "Pets should be empty").to.not.be.empty;
        })
        it('Should execute forсe migration', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/force-migrate',
            });
            await assert.isFulfilled(commandsRunner.run('forceMigrate'));
            let migrations = await sqlRunner('select * from migrations', []);
            expect(migrations, "Should have 3 migrations").to.have.length(3);
            expect(migrations[0].name, "Should executed 1st migration").to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, '1 Migration should be w/o error').to.be.null
            expect(migrations[1].name, "Should executed 2nd migration").to.be.equal('2-insert.sql');
            expect(migrations[1].error_if_happened, '2 Migration should be w/ error').to.not.be.null
            expect(migrations[2].name, "Should executed 3nd migration").to.be.equal('3-insert.sql');
            expect(migrations[2].error_if_happened, '3 Migration should be w/o error').to.be.null
            let pets = await sqlRunner('select * from pet', [])
            expect(pets, "should be 2 pets").to.have.length(2);
        })
        it('Should resolve failed migrations', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/force-migrate',
            });
            commandsRunner.doInit();
            await sqlRunner('insert into migrations (name, run_on, created, error_if_happened) values (?, ?, ?, ?)', ['1-insert.sql', Date.now(), new Date(1), 'error']);
            await commandsRunner.run('resolve');
            let migrations = await sqlRunner('select * from migrations', []);
            expect(migrations, "Should have 1 migrations").to.have.length(1);
            expect(migrations[0].name, "Should executed 1st migration").to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, '1 Migration should be w/o error').to.be.null
        })
        it('Should return failed migrations', async function () {
            let commandsRunner = new CommandsRunner({
                driver: new MysqlDriver(migrationRunner),
                directoryWithScripts: __dirname + '/force-migrate',
            });
            commandsRunner.doInit();
            await sqlRunner('insert into migrations (name, run_on, created, error_if_happened) values (?, ?, ?, ?)', ['1-insert.sql', Date.now(), new Date(1), null]);
            await sqlRunner('insert into migrations (name, run_on, created, error_if_happened) values (?, ?, ?, ?)', ['2-insert.sql', Date.now(), new Date(1), null]);
            await sqlRunner('insert into migrations (name, run_on, created, error_if_happened) values (?, ?, ?, ?)', ['3-insert.sql', Date.now(), new Date(1), 'error']);
            let count = await commandsRunner.getFailedMigrations();
            expect(count).to.be.equal(1)
        })
    });
    run();
}

mySqlTest();
