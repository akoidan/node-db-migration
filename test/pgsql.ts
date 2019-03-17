'use strict';

import {Client} from 'pg';
import Test from './commons';
import {Driver, PsqlDriver} from "../src";
export const DB_NAME = 'node_db_migration_test';



export async function runSql(driver: any, sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
        driver.query(sql, params, (err, res) => {
            if (err) {
                reject(err)
            } else {
                resolve(res ? res.rows : []);
            }
        })
    });
}



export async function closeConnection(driver) {
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

export async function connectDriver(driver) {
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

export function recreateDb(driver) {
    return async () => {
        await runSql(driver, `drop database if exists ${DB_NAME}`, []);
        await runSql(driver, `create database ${DB_NAME}`, []);
    }
}


async function mySqlTest() {

    const dbCreator = new Client({
        connectionString: 'postgresql://postgres:@localhost:5432/postgres',
    });

    await connectDriver(dbCreator);
    let createDb = recreateDb(dbCreator);
    await createDb();

    let currentConnection;
    await Test('pgsql', async () => {
        const migrationRunner = new Client({
            connectionString: `postgresql://postgres:@localhost:5432/${DB_NAME}`,
        });
        await connectDriver(migrationRunner);
        currentConnection = migrationRunner;
        return {driver: new PsqlDriver(migrationRunner), nativeDriver: migrationRunner};
    }, runSql, createDb, async () => {
        await closeConnection(currentConnection)
    }, async() => {
        console.log('asd');
        await runSql(dbCreator,`drop database ${DB_NAME}`, []);
        await closeConnection(dbCreator)
    }, () => {
        let i = 0;
        return () => {
            i++;
            return `$${i}`;
        };
    }, `SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations'`);
    run();
}

mySqlTest();
