import { Cron, type CronOptions } from 'croner';

import { v1 } from '$api/v1';
import { provider } from '$api/v2/provider';
import { usageDatabase } from '$lib/db/models/provider/usage';
import { getApp, startApp } from '$lib/http';
import { providerLog } from '$lib/logger';
import { ENABLE_RESOURCE_PROVIDER, PROVIDER_USAGE_RESET_CRON } from 'src/config';

const cronOptions: CronOptions = {
	catch: (e) => providerLog.error('Usage reset cron failed', { error: String(e) }),
	protect: true
};

async function resetUsage() {
	providerLog.info('Resetting usage data');
	await usageDatabase.resetAllUsage();
}

export function server() {
	if (!ENABLE_RESOURCE_PROVIDER) {
		providerLog.info(
			'Resource Provider API Service is disabled. Set ENABLE_RESOURCE_PROVIDER=true if you wish to run this service.'
		);
		return;
	}

	new Cron(PROVIDER_USAGE_RESET_CRON, cronOptions, resetUsage);
	providerLog.info('Usage reset cron scheduled', { cron: PROVIDER_USAGE_RESET_CRON });

	const app = getApp();
	app.use(v1);
	app.group('/v2', (root) =>
		root.group('/resource', (resource) => resource.group('/provider', (g) => g.use(provider)))
	);

	startApp();
	providerLog.info('Resource Provider API routes loaded');
	return app;
}
