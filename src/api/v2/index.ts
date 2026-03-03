import { Elysia } from 'elysia';

import { lightaccount } from './lightaccount';
import { managed } from './manager';
import { provider } from './provider';

import { ENABLE_LIGHTACCOUNT_PROVIDER } from 'src/config';

export const v2 = new Elysia()
	.group('/v2', (root) =>
		root.group('/resource', (resource) => {
			if (ENABLE_LIGHTACCOUNT_PROVIDER) {
				resource.group('/lightaccount', (app) => app.use(lightaccount));
			}
			resource.group('/manager', (app) => app.use(managed));
			resource.group('/provider', (app) => app.use(provider));
			return resource;
		})
	)
	.onError((context) => {
		switch (context.code) {
			case 'VALIDATION':
				return {
					message: String(context.error),
					all: context.error.all
				};
			default:
				return {
					message: String(context.error)
				};
		}
	});
