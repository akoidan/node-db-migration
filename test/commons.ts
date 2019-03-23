import {assert, expect, use} from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import {AsyncFunc} from 'mocha';
import * as path from 'path';
import * as sinonChai from 'sinon-chai';
import * as sinon from 'sinon';

import {
  ColoredLogger,
  CommandsRunner,
  CommonDriver,
  Driver,
  Logger,
  Migration,
  Param
} from '../src';

import {DriverCreator, SkipAfterEach, SqlRunner} from './types';
import Context = Mocha.Context;
import {SinonSandbox, SinonSpy} from "sinon";
import {SinonSpyStatic} from "sinon";

use(chaiAsPromised);
use(sinonChai);

/* tslint:disable:no-unused-expression */

export async function describeTest<T>(
    testName: string, driverFactory: () => Promise<T>, sqlRunner: SqlRunner<T>,
    beforeEachFn: AsyncFunc, afterEachFn: AsyncFunc, afterFn: AsyncFunc,
    getSeparator: () => () => string, isInitedSql: string,
    driverClass: DriverCreator<T>) {
  function getMigrations(nativeDriver: T): Promise<Migration[]> {
    return sqlRunner<Migration>(nativeDriver, 'select * from migrations', []);
  }

  describe(testName, async function asdfsadf() {

    let sandbox: SinonSandbox;
    let spies: SinonSpy[];
    beforeEach(() => {
      spies = [];
      sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
      spies.forEach(e => e.restore());
      sandbox.restore();
    });

    beforeEach('b', beforeEachFn);
    after(afterFn);
    afterEach(afterEachFn);
    it('init should work', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'list'),
      });
      await commandsRunner.run('init');
      const tableNames = await sqlRunner(nativeDriver, isInitedSql, []);
      expect(tableNames, 'Migration table should exist').to.have.length(1);
    });
    it('Command should fail if not inited', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'list'),
      });
      await assert.isRejected(
          commandsRunner.run('list'), 'Db is not initialized');
    });
    it('fake should work', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'fake'),
      });
      await sqlRunner(nativeDriver, 'CREATE TABLE pet (name VARCHAR(20))', []);
      await commandsRunner.run('init');
      await commandsRunner.run('fake');
      const pets = await sqlRunner(nativeDriver, 'select * from pet', []);
      const migrations = await sqlRunner<Migration>(
          nativeDriver, 'select * from migrations', []);
      expect(migrations, 'Migration should exist').to.have.length(1);
      expect(migrations[0].name, 'Migration name should be ')
          .to.be.equal('1-insert.sql');
      expect(
          migrations[0].error_if_happened, 'Migration should be without error')
          .to.be.null;
      expect(pets, 'Pets should be empty').to.be.empty;
    });
    it('find new migrations should return all migration when db is empty',
        async () => {
          const nativeDriver: T = await driverFactory();
          const driver: CommonDriver<T> = new driverClass(nativeDriver);
          const commandsRunner: CommandsRunner = new CommandsRunner({
            driver,
            directoryWithScripts: path.join(__dirname, 'sql', 'list'),
          });
          await commandsRunner.run('init');
          const migrations = await commandsRunner.findNewMigrations();
          expect(migrations[0].name, 'First migration is 1')
              .to.be.equal('1-insert.sql');
          expect(migrations[1].name, 'Second migration is 2')
              .to.be.equal('2-insert.sql');
        });
    it('Should print only 2nd migration when 1st is exected', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'list'),
      });
      await commandsRunner.run('init');
      const sepFn = getSeparator();
      await sqlRunner(
          nativeDriver,
          `insert into migrations (name, run_on, created, error_if_happened) values (${
              sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`,
          ['1-insert.sql', new Date(), new Date(1), null]);
      const migrations = await commandsRunner.findNewMigrations();
      expect(migrations, 'Exactly 1 unapplied migration should exist')
          .to.have.length(1);
      expect(migrations[0].name, 'First migration is 2')
          .to.be.equal('2-insert.sql');
    });
    it('Migration with error should save it', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'migrate-fail'),
      });
      await commandsRunner.run('init');
      await assert.isRejected(commandsRunner.run('migrate'));
      const migrations = await getMigrations(nativeDriver);
      expect(migrations, 'Should have 1 migration').to.have.length(1);
      expect(migrations[0].name, 'Should migrate pet')
          .to.be.equal('1-insert.sql');
      expect(migrations[0].error_if_happened, 'Migration should contain error')
          .to.not.be.null;
    });
    it('Should run one and fail another', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts:
            path.join(__dirname, 'sql', 'migrate-fail-multiple'),
      });
      await commandsRunner.run('init');
      await assert.isRejected(commandsRunner.run('migrate'));
      const migrations = await getMigrations(nativeDriver);
      expect(migrations, 'Should have 2 migrations').to.have.length(2);
      expect(migrations[0].name, 'Should executed 1st migration')
          .to.be.equal('1-insert.sql');
      expect(migrations[0].error_if_happened, 'Migration should be w/o error')
          .to.be.null;
      expect(migrations[1].name, 'Should executed 2nd migration')
          .to.be.equal('2-insert.sql');
      expect(migrations[1].error_if_happened, 'Migration should be w/ error')
          .to.not.be.null;
      const pets = await sqlRunner(nativeDriver, 'select * from pet', []);
      expect(pets, 'Pets should be empty').to.not.be.empty;
    });
    it('Should execute forсe migration', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner: CommandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'force-migrate'),
      });
      await commandsRunner.run('init');
      await assert.isFulfilled(commandsRunner.run('forceMigrate'));
      const migrations = await getMigrations(nativeDriver);
      expect(migrations, 'Should have 3 migrations').to.have.length(3);
      expect(migrations[0].name, 'Should executed 1st migration')
          .to.be.equal('1-insert.sql');
      expect(migrations[0].error_if_happened, '1 Migration should be w/o error')
          .to.be.null;
      expect(migrations[1].name, 'Should executed 2nd migration')
          .to.be.equal('2-insert.sql');
      expect(migrations[1].error_if_happened, '2 Migration should be w/ error')
          .to.not.be.null;
      expect(migrations[2].name, 'Should executed 3nd migration')
          .to.be.equal('3-insert.sql');
      expect(migrations[2].error_if_happened, '3 Migration should be w/o error')
          .to.be.null;
      const pets = await sqlRunner(nativeDriver, 'select * from pet', []);
      expect(pets, 'should be 2 pets').to.have.length(2);
    });
    it('Should resolve failed migrations', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'force-migrate'),
      });
      await commandsRunner.doInit();
      const sepFn = getSeparator();
      await sqlRunner(
          nativeDriver,
          `insert into migrations (name, run_on, created, error_if_happened) values (${
              sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`,
          ['1-insert.sql', new Date(), new Date(1), 'error']);
      await commandsRunner.run('resolve');
      const migrations = await getMigrations(nativeDriver);
      expect(migrations, 'Should have 1 migrations').to.have.length(1);
      expect(migrations[0].name, 'Should executed 1st migration')
          .to.be.equal('1-insert.sql');
      expect(migrations[0].error_if_happened, '1 Migration should be w/o error')
          .to.be.null;
    });
    it('Should return failed migrations', async () => {
      const nativeDriver: T = await driverFactory();
      const driver: CommonDriver<T> = new driverClass(nativeDriver);
      const commandsRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'force-migrate'),
      });
      await commandsRunner.doInit();
      let sepFn = getSeparator();
      await sqlRunner(
          nativeDriver,
          `insert into migrations (name, run_on, created, error_if_happened) values (${
              sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`,
          ['1-insert.sql', new Date(), new Date(1), null]);
      sepFn = getSeparator();
      await sqlRunner(
          nativeDriver,
          `insert into migrations (name, run_on, created, error_if_happened) values (${
              sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`,
          ['2-insert.sql', new Date(), new Date(1), null]);
      sepFn = getSeparator();
      await sqlRunner(
          nativeDriver,
          `insert into migrations (name, run_on, created, error_if_happened) values (${
              sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`,
          ['3-insert.sql', new Date(), new Date(1), 'error']);
      const count = await commandsRunner.getFailedMigrations();
      expect(count).to.be.equal(1);
    });
    it('The check that driver is passed', async function checkDriverPassed() {
      if (this.test) {
        this.test.skipCloseConnection = true;
      }

      interface DriverCreatorNoArgs<T> {
        new(): CommonDriver<T>;
      }

      const driverInstance = driverClass as DriverCreatorNoArgs<T>;
      expect(() => new driverInstance()).to.throw('dbRunner can\'t be null');
    });
    it('Check uppercase table', async function checkDriverPassed() {
      const nativeDriver: T = await driverFactory();
      expect(() => new driverClass(nativeDriver, 'UpperCase')).to.throw(`Migration table UpperCase can't contain upper case`);
    });
    it('Print Migration', async function checkDriverPassed() {
      const nativeDriver: T = await driverFactory();
      const driver = new driverClass(nativeDriver);
      const commandRunner = new CommandsRunner({
        driver,
        directoryWithScripts: path.join(__dirname, 'sql', 'list-print')
      });
      await commandRunner.run('init');
      const mySpy: SinonSpy<string[], void> = sandbox.spy(ColoredLogger.prototype, 'info');
      await commandRunner.run('list');
      expect(mySpy).to.have.been.calledWith(`New migrations found: 
  - 1-insert.sql
  - 2-insert.sql`);
      spies.push(mySpy);
    });
    it('Print help', async function checkDriverPassed() {
      const nativeDriver: T = await driverFactory();
      const driver = new driverClass(nativeDriver);
      const directoryWithScripts = path.join(__dirname, 'sql');
      const commandRunner = new CommandsRunner({
        driver,
        directoryWithScripts
      });
      const mySpy : SinonSpy<string[], void>= sinon.spy(ColoredLogger.prototype, 'info');
      spies.push(mySpy);
      // const mySpy = sinon.spy(ColoredLogger.prototype, 'info');
      await commandRunner.run('help');
      expect(mySpy).to.have.been.calledWith(`Available commands are: \n\u001b[36minit\u001b[0m: Initialized database for migrations\n\u001b[36mfake\u001b[0m: Fakes the migrations, marks that files in ${directoryWithScripts} are executed successfully\n\u001b[36mlist\u001b[0m: Show all unapplied migrations from ${directoryWithScripts}\n\u001b[36mmigrate\u001b[0m: Installs all new updates from ${directoryWithScripts}\n\u001b[36mforceMigrate\u001b[0m: Installs all new updates from ${directoryWithScripts}. If one migration fails it goes to another one.\n\u001b[36mresolve\u001b[0m: Marks all failed migrations as resolved\n\u001b[36mgetFailed\u001b[0m: Show all failed migrations\n\u001b[36mhelp\u001b[0m: Prints help\n`);
    });
    it('get Failed migrations', async function checkDriverPassed() {
      const nativeDriver: T = await driverFactory();
      const driver = new driverClass(nativeDriver);
      const directoryWithScripts = path.join(__dirname, 'sql', 'migrate-fail-multiple-print');
      const commandRunner = new CommandsRunner({
        driver,
        directoryWithScripts
      });
      await commandRunner.run('init');

      await assert.isRejected(commandRunner.run('migrate'));
      const mySpy: SinonSpy<string[], void> = sinon.spy(ColoredLogger.prototype, 'info');
      await commandRunner.run('getFailed');
      expect(mySpy).to.have.been.calledWith(sinon.match(/ - 2-insert\.sql:\n {3}Error:.*\n {3}Ran on: .*/))
      spies.push(mySpy);
    });
  });
}
