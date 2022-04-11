'use strict';

import * as mysql from 'mysql';
import {Connection, MysqlError} from 'mysql';
import {describeTest} from './commons';
import {MysqlDriver} from '../src';
import {SqlRunner} from './types';


export const runSql: SqlRunner<Connection> =
    <T>(driver: Connection, sql: string, params: unknown[]): Promise<T[]> => {
      return new Promise((resolve, reject) => {
        driver.query(sql, params, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });
    };


export const DB_NAME = 'node_db_migration_test';

export async function closeConnection(driver: Connection) {
  return new Promise((resolve, reject) => {
    driver.end((err?: MysqlError) => {
      if (err) {
        reject(err.message);
      } else {
        resolve();
      }
    });
  });
}

export async function connectDriver(driver: Connection) {
  await new Promise((resolve, reject) => {
    driver.connect((err: MysqlError) => {
      if (err) {
        reject(err.message);
      } else {
        resolve();
      }
    });
  });
}

export function recreateDb(driver: Connection) {
  return async () => {
    await runSql(driver, `drop database if exists ${DB_NAME}`, []);
    await runSql(driver, `create database ${DB_NAME}`, []);
  };
}

async function mySqlTest() {
  const dbCreator: Connection = mysql.createConnection({
    'host': 'localhost',
    'user': 'pychat',
    'password': 'pypass',
    'multipleStatements': true,  // if you have multiple sql in your scripts
  });
  await connectDriver(dbCreator);
  const createDb = recreateDb(dbCreator);
  await createDb();
  const migrationRunner: Connection = mysql.createConnection({
    'host': 'localhost',
    'user': 'pychat',
    'password': 'pypass',
    'database': DB_NAME,
    'multipleStatements': true,  // if you have multiple sql in your scripts
  });
  await connectDriver(migrationRunner);

  const driver = new MysqlDriver(migrationRunner);
  await describeTest(
      'mysql', async () => Promise.resolve(migrationRunner), runSql, createDb,
      () => Promise.resolve(), async function afterFn() {
        await runSql(dbCreator, `drop database ${DB_NAME}`, []);
        await Promise.all(
            [closeConnection(dbCreator), closeConnection(migrationRunner)]);
      }, () => () => '?', `show tables like 'migrations'`, MysqlDriver);
  run();
}

mySqlTest().catch(e => {
  console.error(e);
  process.exit(1);
});
