var sqlite3 = require('sqlite3').verbose();
let {CommandsRunner, SQLite3Driver} = require('./src');


var db = new sqlite3.Database('./test.db');

let migrations = new CommandsRunner({
    driver: new SQLite3Driver(db),
    directoryWithScripts: __dirname + '/diff',
});
migrations.run('list')


