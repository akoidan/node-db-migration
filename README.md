# node-db-migration [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/akoidan/node-db-migration/blob/master/LICENSE) [![npm version](https://img.shields.io/npm/v/node-db-migration.svg)](https://www.npmjs.com/package/node-db-migration) [![Build Status](https://travis-ci.org/akoidan/node-db-migration.svg?branch=master)](https://travis-ci.org/akoidan/node-db-migration) [![codecov](https://codecov.io/gh/akoidan/node-db-migration/branch/master/graph/badge.svg)](https://codecov.io/gh/akoidan/node-db-migration) [![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/akoidan/node-db-migration/issues) [![HitCount](http://hits.dwyl.io/akoidan/node-db-migration.svg)](http://hits.dwyl.io/akoidan/node-db-migration) [![Code Style: Google](https://img.shields.io/badge/code%20style-google-blueviolet.svg)](https://github.com/google/gts)

[![NPM](https://nodei.co/npm/node-db-migration.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/node-db-migration/)

Source control for your database. This is the dummies and simplest package that allows you to automatically install new migrations on your database. Just write your migration scripts in bare sql and this script will do the rest of magic for you!

## What this package does is:
 - creates a database table `migrations` (you can configure it with `migrationTable`) that keeps a track on all migration scripts
 - scans directory for `.sql` files
 - orders sql files by date pattern and executes it sequentially if they weren't executed before
 - marks sql files as executed in database
 - if sql execution fails it saves the exception to database and prevents further migration until you resolve it manually

## To get started:
 - npm install `node-db-migration`
 - create the directory with sql migrations somewhere.
 - put all `.sql` migration files there and name them as `date-name.sql`, e.g. `201705231245-add-pets-table.sql`.
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
        driver: new MysqlDriver(connection),
        directoryWithScripts: __dirname + '/diff',
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
        driver: new PsqlDriver(client),
        directoryWithScripts: __dirname + '/diff',
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
    driver: new SQLite3Driver(db),
    directoryWithScripts: __dirname + '/diff',
});
migrations.run(process.argv[2])
```

Then run this file via node:
```sh
node yourFile.js command
```

## Man

#### Commands:

`migration.run` accepts the following commands:

 - init: Initialized database for migrations
 - fake: Fakes the migrations, marks that files in ./diff are executed successfully
 - list: Show all unapplied migrations from ./diff
 - migrate: Installs all new updates from ./diff
 - forceMigrate: Installs all new updates from ./diff. If one migration fails it goes to another one.
 - resolve: Marks all failed migrations as resolved
 - getFailed: Show all failed migrations
 - help: Prints help

#### Different sql directory:
You can configure path to sqlDirectory passing different path `directoryWithScripts` to `CommandsRunner`. `directoryWithScripts: __dirname + '/migrations/sqls'`
#### Migration table name :
Pass 2nd parameter to new driver constructor e.g. `MysqlDriver(connection, 'migration_table')`. Note that table should be in lowercase especially in postgres.
#### Time format:
The default time format is YYYYMMDDHHmm. You can configure date format with `dateFormat`. e.g. `new CommandsRunner({ dateFormat: 'YYYYMMDDHHmm'})`. This format uses to orders sql files and set theirs creation date in database. For available formats see [moment documentation](https://momentjs.com/docs/#/parsing/string-format/)

## Tips:
- You can also add npm script and run it with `npm run migrate` or something
- You can also integrate this script into initing script of your server. You can use `await migration.run('migrate')`. This will automagically migrate database to the latest version
- Currently node-db-migration was tested only with [mysql](https://github.com/mysqljs/mysql), [pg](https://node-postgres.com/) and [sqlite3](https://github.com/mapbox/node-sqlite3) But it doesn't depend on any specific implementation of db driver. You can create your own driver:


```javascript
let {CommonDriver} = require('node-db-migration');

class MyDriver extends CommonDriver {
   isInitedSql() {
        return `SHOW TABLES LIKE '${this.migrationTable}'`;
    }

    createTableSql() {
        return `CREATE TABLE ${this.migrationTable}` +
            `(` +
            `    id INT PRIMARY KEY AUTO_INCREMENT,` +
            `    name VARCHAR(128) NOT NULL,` +
            `    run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
            `    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,` +
            `    error_if_happened LONGTEXT` +
            `)`;
    }

    query(sql, params, cb) {
        this.dbRunner.query(sql, params, function(error, result) {
            return cb(error /* should be simple string */, result /* should be array of rows */);
        })
    }
}
```

Using async code:

```
javascript

import * as sqlite3 from 'sqlite3';
import {CommandsRunner, SQLite3Driver} from 'node-db-migration';

async function run() {
    const db = new sqlite3.Database(':memory:');
    const migrations = new CommandsRunner({
        driver: new SQLite3Driver(db),
        directoryWithScripts: __dirname + '/diff',
    });
    await migrations.run('migrate')
    console.log("this will print after migrations are finished");
}
run();
```


