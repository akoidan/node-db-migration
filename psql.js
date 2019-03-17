let {CommandsRunner, PsqlDriver} = require('./src');
const { Client } = require('pg')

const client = new Client({
    connectionString: 'postgresql://postgres:@localhost:5432/test5',
});

client.connect(function() {
    let migrations = new CommandsRunner({
        driver: new PsqlDriver(client),
        directoryWithScripts: __dirname + '/diff',
    });
    migrations.run('migrate')
});


