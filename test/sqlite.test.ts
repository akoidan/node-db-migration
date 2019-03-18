'use strict';

import * as sqlite3 from 'sqlite3';
import {Database} from 'sqlite3';

import {describeTest} from './commons';
import {SQLite3Driver} from '../src';
import {SqlRunner} from './types';


export const runSql: SqlRunner<Database> =
    <T>(driver: Database, sql: string, params: unknown[]): Promise<T[]> => {
      return new Promise((resolve, reject) => {
        driver.all(sql, params, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });
    };


export async function closeConnection(driver: Database) {
  return new Promise((resolve, reject) => {
    driver.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function sqliteTest() {
  let db: Database;
  await describeTest(
      'sqlite',
      async () => {
        db = new sqlite3.Database(':memory:');
        const driver = new SQLite3Driver(db);
        return {driver, nativeDriver: db};
      },
      runSql, () => Promise.resolve(),
      async () => {
        await closeConnection(db);
      },
      () => Promise.resolve(), () => () => '?',
      `SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'`);
  run();
}

sqliteTest().catch(e => {
  console.error(e);
  process.exit(1);
});
