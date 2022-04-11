export interface Param {
  color: string;
  param: string;
}

export interface Driver {
  getDbMigrations(): string;

  removeAllMigrations(): string;

  getFailedMigrations(): string;

  markExecuted(): string;

  createUniqueTableIndex(): string;

  query<T>(sql: string, params: unknown[]): Promise<string | null>;

  readQuery<T>(sql: string, params: unknown[]):
      Promise<MigrationQueryResult<T>>;

  isInitedSql(): string;

  createTableSql(): string;

  executeMultipleStatements<T>(sql: string): Promise<string | null>;
}

export interface Migration {
  id: number;
  name: string;
  run_on: Date;
  created: Date;
  error_if_happened: string;
}

export interface CommandDescription {
  description: string;
  run: Function;
  skipInit?: boolean;
}

export interface NameCreated {
  name: string;
  created: Date;
}

export interface Config {
  directoryWithScripts: string;
  dateFormat?: string;
  driver: Driver;
  logger?: Logger;
}

export interface MigrationQueryResult<T> {
  error: string | null;
  rows: T[];
}

export interface Logger {
  success(text: string): void;

  info(text: string): void;

  infoParams(text: string, ...params: string[]): void;

  infoParamsColor(text: string, ...params: Param[]): void;
  colors: {[id: string]: string};
}
