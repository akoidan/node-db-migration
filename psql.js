let {CommandsRunner, PsqlDriver} = require('./index');
const { Client } = require('pg')

const client = new Client({
    connectionString: 'postgresql://postgres:@localhost:5432/test5',
});

client.connect(function() {
    let migrations = new CommandsRunner({
        driver: new PsqlDriver(client.query.bind(client), 'migrationTableName'),
        directoryWithScripts: __dirname + '/diff', // path of the directory with sql files
        dateFormat: 'YYYYMMDDHHmm', // sql file names date pattern, , this param is not required
    });
    migrations.run('resolve')
});


