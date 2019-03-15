var sqlite3 = require('sqlite3').verbose();
let {CommandsRunner, SQLite3Driver} = require('./index');


var db = new sqlite3.Database('./test');

let migrations = new CommandsRunner({
    driver: new SQLite3Driver(db),
    directoryWithScripts: __dirname + '/diff',
});
migrations.run()


