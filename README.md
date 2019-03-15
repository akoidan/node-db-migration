# node-db-migration

## sourcecontrol for your database

This is the dummies and simplest package that allows you to automatically install new migrations on your database. Just write your migration scripts in bare sql and this script will do the rest of magic for you!

## What this package does is:
 - creates a database table `migrations` (you can configure it with `migrationTable`) that keeps a track on all migration scripts
 - scans directory for `.sql` files
 - orders sql files by date pattern and executes it sequentially if they weren't executed before
 - marks sql files as executed in database
 - if sql execution fails it saves the exception to database and prevents further migration until you resolve it manually

## To get started:
 - npm install `node-db-migration`
 - create the directory with sql migrations somewhere. You can configure it with `directoryWithScripts`
 - put all `.sql` migration files there and name them as `date-name.sql`, e.g. `201705231245-add-pets-table.sql`. You can configure date format it with `dateFormat`. For available formats see [moment documentation](https://momentjs.com/docs/#/parsing/string-format/)
 - integrate the code bellow into your project:

### mysql:

```javascript
var mysql = require('mysql');
let {CommandsRunner, MysqlDriver} = require('node-db-migration');

var connection = mysql.createConnection({
    "host" : "localhost",
    "user" : "root",
    "database" : "test8",
    "multipleStatements" : true, // if you have multiple sql in your scripts
});

connection.connect(function(err) {
    let migrations = new CommandsRunner({
        driver: new MysqlDriver(connection, 'migrations'), //migration table name, not required, should be in lowercase!
        directoryWithScripts: __dirname + '/diff', // path of the directory with sql files
        dateFormat: 'YYYYMMDDHHmm', // sql file names date pattern, not required
    });
    migrations.run(process.argv[2])
});
```

### psql:

```javascript
let {CommandsRunner, PsqlDriver} = require('node-db-migration');
const { Client } = require('pg')

const client = new Client({
    connectionString: 'postgresql://postgres:@localhost:5432/test5',
});

client.connect(function() {
    let migrations = new CommandsRunner({
        driver: new PsqlDriver(client, 'migrations'), // migration table name, not required, should be in lowercase!
        directoryWithScripts: __dirname + '/diff', // path of the directory with sql files
        dateFormat: 'YYYYMMDDHHmm', // sql file names date pattern, , this param is not required
    });
    migrations.run(process.argv[2])
});
```

### sqlite:

```javascript
var sqlite3 = require('sqlite3').verbose();
let {CommandsRunner, SQLite3Driver} = require('node-db-migration');


var db = new sqlite3.Database('./test');

let migrations = new CommandsRunner({
    driver: new SQLite3Driver(db, 'migration table'), // migration table name, not required, should be in lowercase!
    directoryWithScripts: __dirname + '/diff', // path of the directory with sql files
    dateFormat: 'YYYYMMDDHHmm', // sql file names date pattern, not required
});
migrations.run(process.argv[2])
```

and
```sh
node yourFile.js command
```

## Commands:

`migration.run` accepts the following commands:

 - init: Initialized database for migrations
 - fake: Fakes the migrations, marks that files in /home/andrew/WebstormProjects/node-db-migration/diff are executed successfully
 - list: Show all unapplied migrations from /home/andrew/WebstormProjects/node-db-migration/diff
 - migrate: Installs all new updates from /home/andrew/WebstormProjects/node-db-migration/diff
 - forceMigrate: Installs all new updates from /home/andrew/WebstormProjects/node-db-migration/diff. If one migration fails it goes to another one.
 - resolve: Marks all failed migrations as resolved
 - getFailed: Show all failed migrations

## Tips:
- You can also add npm script and run it with `npm run migrate` or something
- You can also integrate this script into initing script of your server. You can use `migrations.run('migrate')'`. This will automagically migrate database to the latest version
- Currently node-db-migration was tested only with [mysql](https://github.com/mysqljs/mysql), [pg](https://node-postgres.com/) and [sqlite3](https://github.com/mapbox/node-sqlite3) But it doesn't depend on any specific implementation of db driver. You can create your own driver:


```javascript
class MyDriver extends CommonDriver {

    constructor() {
        super((sql, params, cb) => {
             yourRunner.queryDb(sql, params, cb); // inject your driver here if it has custom format
        })
    }
    
    existsSql() {
        return `SELECT 1 FROM information_schema.tables WHERE table_name = '${this.migrationTable}'`;
    }

    markExecuted() {
        return `insert into ${this.migrationTable} (name, created, error_if_happened) values ($1, $2, $3)`
    }

    runSqlError(sql, params, cb) {
        this.dbRunner(sql, params, function(error, result) {
            return cb(error);
        })
    }

    runSql(sql, params, cb) {
        this.dbRunner(sql, params, function(error, result) {
            if (error) {
                throw JSON.stringify(err);
            }
            return cb(result.rows);
        })
    }

    createTableSql() {
            return `CREATE TABLE ${this.migrationTable}
    (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(128) NOT NULL,
        run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        error_if_happened LONGTEXT
    ) `;
    }
}
```


