import { Option } from 'commander';
import inquirer from 'inquirer';
const supportedBoilerplates = new Set(['drizzle']);
export const createDatabaseCommand = (program) => {
    const dbCommand = program
        .command('db')
        .alias('database')
        .description(`Provision a production ready Postgres database with a single command`)
        .addExamples([
        'netlify db status',
        'netlify db init',
        'netlify db init --help',
        ...(process.env.EXPERIMENTAL_NETLIFY_DB_ENABLED === '1' ? ['netlify db migrate', 'netlify db reset'] : []),
    ]);
    dbCommand
        .command('init')
        .description(`Initialize a new database for the current site`)
        .option('--assume-no', 'Non-interactive setup. Does not initialize any third-party tools/boilerplate. Ideal for CI environments or AI tools.', false)
        .addOption(new Option('--boilerplate <tool>', 'Type of boilerplate to add to your project.').choices(Array.from(supportedBoilerplates).sort()))
        .option('--no-boilerplate', "Don't add any boilerplate to your project.")
        .option('-o, --overwrite', 'Overwrites existing files that would be created when setting up boilerplate')
        .action(async (_options, command) => {
        const { init } = await import('./init.js');
        // Only prompt for drizzle if the user did not specify a boilerplate option, and if we're in
        // interactive mode
        if (_options.boilerplate === undefined && !_options.assumeNo) {
            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'useDrizzle',
                    message: 'Set up Drizzle boilerplate?',
                },
            ]);
            if (answers.useDrizzle) {
                command.setOptionValue('boilerplate', 'drizzle');
            }
        }
        const options = _options;
        if (options.assumeNo) {
            options.boilerplate = false;
            options.overwrite = false;
        }
        await init(options, command);
    })
        .addExamples([`netlify db init --assume-no`, `netlify db init --boilerplate=drizzle --overwrite`]);
    dbCommand
        .command('status')
        .description(`Check the status of the database`)
        .action(async (options, command) => {
        const { status } = await import('./status.js');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await status(options, command);
    });
    if (process.env.EXPERIMENTAL_NETLIFY_DB_ENABLED === '1') {
        dbCommand
            .command('migrate')
            .description('Apply database migrations to the local development database')
            .option('--to <name>', 'Target migration name or prefix to apply up to (applies all if omitted)')
            .option('--json', 'Output result as JSON')
            .action(async (options, command) => {
            const { migrate } = await import('./migrate.js');
            await migrate(options, command);
        });
        dbCommand
            .command('reset')
            .description('Reset the local development database, removing all data and tables')
            .option('--json', 'Output result as JSON')
            .action(async (options, command) => {
            const { reset } = await import('./reset.js');
            await reset(options, command);
        });
    }
};
//# sourceMappingURL=database.js.map