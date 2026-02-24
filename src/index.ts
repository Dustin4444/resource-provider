import { prompt } from './cli';
import { ENVIRONMENT } from './config';
import { server } from './provider';

import { runMigrations } from '$lib/db/migrate';
import { generalLog } from '$lib/logger';

runMigrations();

if (ENVIRONMENT === 'testing') {
	generalLog.debug('Starting server in testing environment...');
	server();
} else {
	// Otherwise use prompt for CLI commands
	prompt();
}
