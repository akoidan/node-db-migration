import {Driver} from '../src';

export interface SqlRunner<D> {
  <T>(driver: D, sql: string, params: unknown[]): Promise<T[]>;
}

export interface DriverRunner<T> {
  (): Promise<{driver: Driver, nativeDriver: T}>;
}
