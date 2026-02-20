import { Argument, Command } from 'commander';

import { version } from '../../package.json';
import { generalLog } from '../lib/logger';
import { manager } from '../manager';
import { server } from '../provider';

import { makeManagerAddCommand } from './manager/add';
import { makeManagerListCommand } from './manager/list';
import { makeManagerRemoveCommand } from './manager/remove';
import { makeManagerRunCommand } from './manager/run';
import { makeManagerSetupCommand } from './manager/setup';
import { makeManagerUnauthorizeCommand } from './manager/unauthorize';

import { contractsDatabase } from '$lib/db/models/contract/contracts';
import { usageDatabase } from '$lib/db/models/provider/usage';
import { createEnvironmentalFile } from '$lib/env';

const services = ['all', 'api', 'manager'];

export function prompt() {
	const program = new Command();
	program
		.version(version)
		.name('resource-provider')
		.description('Antelope Resource Provider Service');

	program
		.command('config')
		.description('Create a new blank configuration file')
		.action(async () => {
			await createEnvironmentalFile();
			generalLog.info('Created a new blank configuration file (.env)');
		});

	program.commandsGroup('Run Service');
	program
		.command('start')
		.addArgument(
			new Argument('[service]', 'The service name to start').default('all').choices(services)
		)
		.description('Run one or more resource provider services (e.g. all, api, manager)')
		.action((service) => {
			if (service === 'all' || service === 'api') {
				server();
			}
			if (service === 'all' || service === 'manager') {
				manager();
			}
		});

	program.commandsGroup('Resource Manager');
	const manage = program
		.command('manager [add|list|remove|run|setup|unauthorize]')
		.description('Define a list of accounts and automatically manage their network resources.');
	manage.addCommand(makeManagerAddCommand());
	manage.addCommand(makeManagerListCommand());
	manage.addCommand(makeManagerRemoveCommand());
	manage.addCommand(makeManagerRunCommand());
	manage.addCommand(makeManagerSetupCommand());
	manage.addCommand(makeManagerUnauthorizeCommand());

	program.commandsGroup('User Management');
	program
		.command('reset')
		.description('Reset all usage tracking records')
		.action(async () => {
			generalLog.info('Resetting all usage records');
			await usageDatabase.resetAllUsage();
		});
	program
		.command('usage')
		.description('Get the total usage for a specific account name')
		.argument('<string>', 'account name to query')
		.action(async (name) => {
			const result = await usageDatabase.getUsage(name);
			generalLog.info(`Usage for ${name}:`, result);
		});
	program.commandsGroup('Database Management');
	program
		.command('flush')
		.description('Flush the cached ABIs from the database')
		.action(async () => {
			generalLog.info('Flushing cached ABIs from the database');
			await contractsDatabase.clear();
		});
	program
		.command('vacuum')
		.description('Force SQLITE3 database vacuum')
		.action(() => {
			generalLog.info('Vacuuming database');
			usageDatabase.vacuum();
		});
	program.parse(process.argv);
}
