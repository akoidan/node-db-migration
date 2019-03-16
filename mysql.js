var mysql = require('mysql');
let {CommandsRunner, MysqlDriver} = require('./index');

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
    migrations.run('resolve')
});
