import {CommandsRunner, Driver} from '../src';
import {assert, expect, use} from 'chai';
import * as  path from 'path';
import * as chaiAsPromised from 'chai-as-promised';


use(chaiAsPromised);

export default async function (testName: string, driverFactory: () => Promise<{ driver: Driver, nativeDriver: any }>, sqlRunner: (driver: any, sql: string, params: any[]) => Promise<any[]>, beforeEachFn, afterEachFn, afterFn, getSeparator: () => () => string, isInitedSql: string) {
    describe(testName, async () => {
        beforeEach(beforeEachFn);
        after(afterFn);
        afterEach(afterEachFn);
        it('init should work', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'list'),
            });
            await commandsRunner.run('init');
            let tableNames = await sqlRunner(nativeDriver, isInitedSql, []);
            expect(tableNames, 'Migration table should exist').to.have.length(1);
        });
        it('init should fail if already inited', async function () {
            let {driver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'list'),
            });
            await commandsRunner.run('init');
            await assert.isRejected(commandsRunner.run('init'), 'DB is already initialized');
        });
        it('fake should work', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'fake'),
            });
            await sqlRunner(nativeDriver, 'CREATE TABLE pet (name VARCHAR(20))', []);
            await commandsRunner.run('fake');
            let pets = await sqlRunner(nativeDriver, 'select * from pet', []);
            let migrations = await sqlRunner(nativeDriver, 'select * from migrations', []);
            expect(migrations, 'Migration should exist').to.have.length(1);
            expect(migrations[0].name, 'Migration name should be ').to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, 'Migration should be without error').to.be.null;
            expect(pets, 'Pets should be empty').to.be.empty;
        });
        it('find new migrations should return all migration when db is empty', async function () {
            let {driver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'list'),
            });
            await commandsRunner.run('init');
            let migrations = await commandsRunner.findNewMigrations();
            expect(migrations[0].name, 'First migration is 1').to.be.equal('1-insert.sql');
            expect(migrations[1].name, 'Second migration is 2').to.be.equal('2-insert.sql');
        });
        it('Should print only 2nd migration when 1st is exected', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'list'),
            });
            await commandsRunner.run('init');
            let sepFn = getSeparator();
            await sqlRunner(nativeDriver, `insert into migrations (name, run_on, created, error_if_happened) values (${sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`, ['1-insert.sql', new Date(), new Date(1), null]);
            let migrations = await commandsRunner.findNewMigrations();
            expect(migrations, 'Exactly 1 unapplied migration should exist').to.have.length(1);
            expect(migrations[0].name, 'First migration is 2').to.be.equal('2-insert.sql');
        });
        it('Migration with error should save it', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'migrate-fail'),
            });
            await assert.isRejected(commandsRunner.run('migrate'));
            let migrations = await sqlRunner(nativeDriver, 'select * from migrations', []);
            expect(migrations, 'Should have 1 migration').to.have.length(1);
            expect(migrations[0].name, 'Should migrate pet').to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, 'Migration should contain error').to.not.be.null;
        });
        it('Should run one and fail another', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'migrate-fail-multiple'),
            });
            await assert.isRejected(commandsRunner.run('migrate'));
            let migrations = await sqlRunner(nativeDriver, 'select * from migrations', []);
            expect(migrations, 'Should have 2 migrations').to.have.length(2);
            expect(migrations[0].name, 'Should executed 1st migration').to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, 'Migration should be w/o error').to.be.null;
            expect(migrations[1].name, 'Should executed 2nd migration').to.be.equal('2-insert.sql');
            expect(migrations[1].error_if_happened, 'Migration should be w/ error').to.not.be.null;
            let pets = await sqlRunner(nativeDriver, 'select * from pet', []);
            expect(pets, 'Pets should be empty').to.not.be.empty;
        });
        it('Should execute forсe migration', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'force-migrate'),
            });
            await assert.isFulfilled(commandsRunner.run('forceMigrate'));
            let migrations = await sqlRunner(nativeDriver, 'select * from migrations', []);
            expect(migrations, 'Should have 3 migrations').to.have.length(3);
            expect(migrations[0].name, 'Should executed 1st migration').to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, '1 Migration should be w/o error').to.be.null;
            expect(migrations[1].name, 'Should executed 2nd migration').to.be.equal('2-insert.sql');
            expect(migrations[1].error_if_happened, '2 Migration should be w/ error').to.not.be.null;
            expect(migrations[2].name, 'Should executed 3nd migration').to.be.equal('3-insert.sql');
            expect(migrations[2].error_if_happened, '3 Migration should be w/o error').to.be.null;
            let pets = await sqlRunner(nativeDriver, 'select * from pet', []);
            expect(pets, 'should be 2 pets').to.have.length(2);
        });
        it('Should resolve failed migrations', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'force-migrate'),
            });
            await commandsRunner.doInit();
            let sepFn = getSeparator();
            await sqlRunner(nativeDriver, `insert into migrations (name, run_on, created, error_if_happened) values (${sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`, ['1-insert.sql', new Date(), new Date(1), 'error']);
            await commandsRunner.run('resolve');
            let migrations = await sqlRunner(nativeDriver, 'select * from migrations', []);
            expect(migrations, 'Should have 1 migrations').to.have.length(1);
            expect(migrations[0].name, 'Should executed 1st migration').to.be.equal('1-insert.sql');
            expect(migrations[0].error_if_happened, '1 Migration should be w/o error').to.be.null;
        });
        it('Should return failed migrations', async function () {
            let {driver, nativeDriver} = await driverFactory();
            let commandsRunner = new CommandsRunner({
                driver,
                directoryWithScripts: path.join(__dirname, 'sql', 'force-migrate'),
            });
            await commandsRunner.doInit();
            let sepFn = getSeparator();
            await sqlRunner(nativeDriver, `insert into migrations (name, run_on, created, error_if_happened) values (${sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`, ['1-insert.sql', new Date(), new Date(1), null]);
            sepFn = getSeparator();
            await sqlRunner(nativeDriver, `insert into migrations (name, run_on, created, error_if_happened) values (${sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`, ['2-insert.sql', new Date(), new Date(1), null]);
            sepFn = getSeparator();
            await sqlRunner(nativeDriver, `insert into migrations (name, run_on, created, error_if_happened) values (${sepFn()}, ${sepFn()}, ${sepFn()}, ${sepFn()})`, ['3-insert.sql', new Date(), new Date(1), 'error']);
            let count = await commandsRunner.getFailedMigrations();
            expect(count).to.be.equal(1);
        });
    });
}
