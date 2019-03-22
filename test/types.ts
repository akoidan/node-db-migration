import {CommonDriver, Driver} from '../src';

export interface SqlRunner<D> {
  <T>(driver: D, sql: string, params: unknown[]): Promise<T[]>;
}

export interface DriverCreator<T> {
  new(dbRunner: T, migrationTable?: string): CommonDriver<T>;
}

export interface SkipAfterEach {
  skipAfterEach?: boolean;
}

declare module 'mocha' {
  interface Runnable {
    skipCloseConnection?: boolean;
  }
}
