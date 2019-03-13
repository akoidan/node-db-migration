# node-db-migration sourcecontrol for your database

This is the dummies and simpliest package that allows you to automatically install new migrations on your database.
What this package does is:
 - creates a database table `migrations` (you can configure it with `migrationTable`) that keeps a track on all migration scripts
 - scans directory for `.sql` files
 - orders sql files by date and executes it sequentially if they weren't executed before
 - marks sql files as executed in database
 - if sql execution fails it saves the exception to database and prevents further migration until you resolve it manually

### To get started:
 - create the directory with sql migrations somewhere. You can configure it with `directoryWithScripts`
 - put all .sql migration files there with the name `date-name.sql`, where date is some kind of date format e.g. 201705231245-add-pets-table.sql. You can configure it with `dateFormat`
 - integrate the code bellow into your project:

```javascript
var mysql = require('mysql');
let Migrations = require('node-db-migration');

var connection = mysql.createConnection({
    "host" : "localhost",
    "user" : "root",
    "database" : "test",
    "multipleStatements" : true,
});

connection.connect(function(err) {
    let migrations = new Migrations({
        dbRunner: function (sql, args, cb) {
            connection.query(sql, args, (error, results, fields) => {
              cb(results, error)
            });
        },
        migrationTable: 'migrations', // migration table name
        directoryWithScripts: './diff', // path of the directory with sqls
        dateFormat: 'YYYYMMDDHHmm', // file start format e.g. 201705231245-add-pets-table.sql
    });
    migrations.run(process.argv[2])
});
```

and
```sh
node yourFile.js command
```
You can also add npm script and run it with `npm run migrate` or something
You can also integrate this script into initing script of your server. You can use `migrations.run('migrate')'`. This will automagically migrate database to the latest version

migration.run accepts the following commands:

- init: Initialized database for migrations
- fake: Fakes the migrations, marks that files in ./diff are executed successfully
- list: Show all unapplied migrations from ./diff
- migrate: Installs all new updates from ./diff
- forceMigrate: Installs all new updates from ./diff. If one migration fails it goes to another one.
- resolve: Marks all failed migrations as resolved

Note: Currently node-db-migration was tested only with [mysql](https://github.com/mysqljs/mysql). But it doesn't depend on any specific implementation of db driver. This package exports `Migrations` class that you can extend like bellow and override methods you want:


```javascript
class MyMigration extends Migrations {

    constructor(config) {
        super(config);
    }
}
```


