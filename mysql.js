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
        driver: new MysqlDriver(connection.query.bind(connection), 'daS'),
        directoryWithScripts: __dirname + '/diff', // path of the directory with sql files
        dateFormat: 'YYYYMMDDHHmm', // sql file names date pattern, , this param is not required
    });
    migrations.run('migrate')
});
