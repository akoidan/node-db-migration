'use strict';

import {Client} from 'pg';
import {describeTest} from './commons';
import {PsqlDriver} from '../src';
import {SqlRunner} from './types';

export const DB_NAME = 'node_db_migration_test';

export const runSql: SqlRunner<Client> =
    <T>(driver: Client, sql: string, params: unknown[]): Promise<T[]> => {
      return new Promise((resolve, reject) => {
        driver.query(sql, params, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res ? res.rows : []);
          }
        });
      });
    };

export async function closeConnection(driver: Client) {
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

export async function connectDriver(driver: Client) {
  await new Promise((resolve, reject) => {
    driver.connect((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function recreateDb(driver: Client) {
  return async () => {
    await runSql(driver, `drop database if exists ${DB_NAME}`, []);
    await runSql(driver, `create database ${DB_NAME}`, []);
  };
}


async function pgSqlTest() {
  const dbCreator = new Client({
    connectionString: 'postgresql://postgres:@localhost:5432/postgres',
  });

  await connectDriver(dbCreator);
  const createDb = recreateDb(dbCreator);
  await createDb();

  let currentConnection: Client;
  await describeTest(
      'pgsql',
      async () => {
        const migrationRunner: Client = new Client({
          connectionString: `postgresql://postgres:@localhost:5432/${DB_NAME}`,
        });
        await connectDriver(migrationRunner);
        currentConnection = migrationRunner;
        return {
          driver: new PsqlDriver(migrationRunner),
          nativeDriver: migrationRunner
        };
      },
      runSql, createDb,
      async () => {
        await closeConnection(currentConnection);
      },
      async () => {
        await runSql(dbCreator, `drop database ${DB_NAME}`, []);
        await closeConnection(dbCreator);
      },
      () => {
        let i = 0;
        return () => {
          i++;
          return `$${i}`;
        };
      },
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations'`);
  run();
}

pgSqlTest().catch(e => {
  console.error(e);
  process.exit(1);
});
