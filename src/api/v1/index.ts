import { Elysia } from 'elysia';
import type { Static } from 'elysia';

// import { powerup } from './powerup';
import { request } from './request';
import {
	// v1PowerupRequest,
	v1ProviderRequest
} from './types';
import type { v1ResponseRejected } from './types';

import { providerLog } from '$lib/logger';

export const v1 = new Elysia()
	.onParse({ as: 'scoped' }, async ({ request, contentType }) => {
		if (contentType === 'text/plain') {
			return request.json();
		}
	})
	.group('/v1', (root) =>
		root.group('/resource_provider', (group) =>
			group
				// .post('/request_powerup', powerup, v1PowerupRequest)
				.post('/request_transaction', request, v1ProviderRequest)
		)
	)
	.onError((context): Static<typeof v1ResponseRejected> => {
		switch (context.code) {
			case 'VALIDATION':
				return {
					code: 400,
					message: String(context.error),
					error: context.error.all
				};
			default:
				providerLog.error('Request failed', { error: String(context.error) });
				return {
					code: 400,
					message: String(context.error)
				};
		}
	});
