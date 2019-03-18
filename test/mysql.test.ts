'use strict';

import * as mysql from 'mysql';
import {Connection} from 'mysql';
import Test from './commons';
import {MysqlDriver} from '../src';


export async function runSql(driver: any, sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
        driver.query(sql, params, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

export const DB_NAME = 'node_db_migration_test';

export async function closeConnection(driver) {
    return new Promise((resolve, reject) => {
        driver.end((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export  async function connectDriver(driver) {
    await new Promise((resolve, reject) => {
        driver.connect(function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export function recreateDb(driver) {
    return async () => {
        await runSql(driver, `drop database if exists ${DB_NAME}`, []);
        await runSql(driver, `create database ${DB_NAME}`, []);
    };
}

async function mySqlTest() {

    let dbCreator: Connection = mysql.createConnection({
        'host': 'localhost',
        'user': 'root',
        'multipleStatements': true, // if you have multiple sql in your scripts
    });
    await connectDriver(dbCreator);
    let createDb = recreateDb(dbCreator);
    await createDb();
    let migrationRunner: Connection = mysql.createConnection({
        'host': 'localhost',
        'user': 'root',
        'database': DB_NAME,
        'multipleStatements': true, // if you have multiple sql in your scripts
    });
    await connectDriver(migrationRunner);

    let driver = new MysqlDriver(migrationRunner);
    await Test('mysql', async () => Promise.resolve({
        driver,
        nativeDriver: migrationRunner
    }), runSql, createDb, () => Promise.resolve(), async function afterFn() {
        await runSql(dbCreator, `drop database ${DB_NAME}`, []);
        await Promise.all([
            closeConnection(dbCreator),
            closeConnection(migrationRunner)
        ]);
    }, () => () => '?', `show tables like 'migrations'`);
    run();
}

mySqlTest().catch(e => {
    console.error(e);
    process.exit(1);
});

