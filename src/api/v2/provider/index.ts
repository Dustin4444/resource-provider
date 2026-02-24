import { Elysia } from 'elysia';
import type { Static } from 'elysia';

import { v2ProviderRequest, v2ProviderRequestPacked, v2ProviderRequestTransaction, v2ProviderUsage } from './types';
import type { v2ProviderRequestBody, v2ProviderResponseSuccess } from './types';
import { usage } from './usage';

export async function processResourceRequest({
	body
}: {
	body: Static<typeof v2ProviderRequestBody>;
}): Promise<Static<typeof v2ProviderResponseSuccess>> {
	throw new Error('Not implemented' + body.signer);
}

export const provider = new Elysia()
	.get('/usage/:account', usage, v2ProviderUsage)
	.group('/request', (root) =>
		root
			.post('/', processResourceRequest, v2ProviderRequest)
			.post('/packed', processResourceRequest, v2ProviderRequestPacked)
			.post('/transaction', processResourceRequest, v2ProviderRequestTransaction)
	);
