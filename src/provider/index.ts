import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import type { ElysiaSwaggerConfig } from '@elysiajs/swagger';
import { Cron, type CronOptions } from 'croner';
import { Elysia } from 'elysia';
import { BunAdapter } from 'elysia/adapter/bun';

import { v1 } from '$api/v1';
import { v2 } from '$api/v2';
import { usageDatabase } from '$lib/db/models/provider/usage';
import { providerLog } from '$lib/logger';
import { ENABLE_RESOURCE_PROVIDER, PROVIDER_USAGE_RESET_CRON, SERVICE_HTTP_PORT } from 'src/config';

const port = SERVICE_HTTP_PORT || 3000;

const swaggerConfig: ElysiaSwaggerConfig = {
	documentation: {
		info: {
			title: 'Resource Provider APIs',
			description: 'API documentation for Resource Provider services',
			version: '0.0.0'
		},
		security: [{ bearerAuth: [] }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'string',
					description: 'Enter Bearer token **_only_**'
				}
			}
		},
		tags: [
			{
				name: 'Resource Provider (v2)',
				description: 'Resource Provider endpoints to publicly offer resources to users.'
			},
			{
				name: 'Resource Provider (v1)',
				description: 'Legacy Resource Provider endpoints'
			},
			{
				name: 'Resource Manager',
				description: 'Resource Management endpoints for resource automation (requires Bearer token)'
			}
		]
	},
	swaggerOptions: {
		persistAuthorization: true
	}
};

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

	const app = new Elysia({
		adapter: BunAdapter,
		aot: true
	});

	app.use(cors({ origin: true }));
	app.use(swagger(swaggerConfig));
	app.use(v1);
	app.use(v2);
	app.listen(SERVICE_HTTP_PORT);

	providerLog.info(`Resource Provider API running on http://localhost:${port}`);
	return app;
}
