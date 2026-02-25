import { t } from 'elysia';
import type { Static } from 'elysia';

import {
	TPackedTransaction,
	TSigner,
	TTransaction,
	v2GenericResponse,
	v2GenericResponseError
} from '$lib/types';

export const v1PowerupRequestBody = t.Object(
	{
		account: t.String()
	},
	{
		examples: [
			{
				account: 'test.gm'
			}
		]
	}
);

export const v1PowerupResponseSuccess = t.Object(v2GenericResponse.properties, {
	description: 'Response to a succesful powerup request.'
});

export const v1PowerupResponseRejected = t.Object(v2GenericResponse.properties, {
	description: 'Response to a rejected powerup request.'
});

export const v1PowerupRequest = {
	body: v1PowerupRequestBody,
	detail: {
		summary: 'Request PowerUp',
		tags: ['Resource Provider (v1)']
	},
	response: {
		200: v1PowerupResponseSuccess,
		400: v1PowerupResponseRejected
	}
};

export const v1ProviderRequestBody = t.Object(
	{
		signer: TSigner,
		ref: t.Optional(t.String()),
		request: t.Optional(t.String()),
		transaction: t.Optional(TTransaction),
		packedTransaction: t.Optional(TPackedTransaction)
	},
	{
		examples: [
			{
				signer: {
					actor: 'test.gm',
					permission: 'active'
				},
				request:
					'esr://gmNgZGBY1mTC_MoglIGBIVzX5uxZRqAQGDBBaWeYAINP360cgcXzYHwWRwitFJRanF9alJyqUFCUX5aZklqkUJJaXKJQUpSYV5yYXJKZnwfUAgA'
			}
		]
	}
);

export const v1ProviderRequestResponseType = t.Tuple([t.String(), t.Any()]);

export const v1ResponseResources = t.Object({
	cpu: t.Numeric(),
	net: t.Numeric(),
	ram: t.Numeric()
});

export const v1ResponseSuccess = t.Object(
	{
		code: t.Number(),
		data: t.Object({
			request: v1ProviderRequestResponseType,
			resources: v1ResponseResources,
			signatures: t.Array(t.String())
		})
	},
	{
		description: 'Successful request returning a transaction modified to include a noop action.'
	}
);

export const v1ResponseRejected = t.Object(v2GenericResponseError.properties, {
	description: 'Failed request with an error message stating a rejection reason.'
});

export const v1ResponseRequiresPayment = t.Object(
	{
		code: t.Number(),
		data: t.Object({
			costs: t.Optional(
				t.Object({
					cpu: t.Optional(t.String()),
					net: t.Optional(t.String()),
					ram: t.Optional(t.String())
				})
			),
			fee: t.Optional(t.String()),
			request: v1ProviderRequestResponseType,
			resources: v1ResponseResources,
			signatures: t.Array(t.String())
		})
	},
	{
		description:
			'Successful request returning a transaction modified to include a transaction fee and noop action.'
	}
);

export type v1ResponseTypes = Static<
	typeof v1ResponseSuccess | typeof v1ResponseRejected | typeof v1ResponseRequiresPayment
>;

export type v1PowerupResponse = Static<
	typeof v1PowerupResponseSuccess | typeof v1PowerupResponseRejected
>;

export const v1ProviderRequest = {
	body: v1ProviderRequestBody,
	detail: {
		summary: 'Cosign Transaction',
		tags: ['Resource Provider (v1)']
	},
	response: {
		200: v1ResponseSuccess,
		400: v1ResponseRejected,
		402: v1ResponseRequiresPayment
	}
};
