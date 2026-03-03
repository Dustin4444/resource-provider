import { t } from 'elysia';

import { TTransaction, v2GenericResponseError } from '$lib/types';

const tags = ['Light Account Provider (v2)'];

export const lightAccountRequestBody = t.Object(
	{
		credential_id: t.Number(),
		request: t.Optional(t.String()),
		transaction: t.Optional(TTransaction)
	},
	{
		examples: [
			{
				credential_id: 1,
				request:
					'esr://gmNgZGBY1mTC_MoglIGBIVzX5uxZRqAQGDBBaWeYAINP360cgcXzYHwWRwitFJRanF9alJyqUFCUX5aZklqkUJJaXKJQUpSYV5yYXJKZnwfUAgA'
			}
		]
	}
);

export const lightAccountResponsePayment = t.Object(
	{
		code: t.Number(),
		data: t.Object({
			costs: t.Object({
				cpu: t.String(),
				net: t.String(),
				ram: t.String()
			}),
			fee: t.String(),
			request: t.Tuple([t.String(), t.Any()]),
			resources: t.Object({
				cpu: t.Numeric(),
				net: t.Numeric(),
				ram: t.Numeric()
			}),
			signatures: t.Array(t.String())
		})
	},
	{
		description:
			'Transaction modified with cosigner authorization and fee action. Client must inspect and sign.'
	}
);

export const lightAccountResponseRejected = t.Object(v2GenericResponseError.properties, {
	description: 'Rejected request with an error message.'
});

export const lightAccountRequest = {
	body: lightAccountRequestBody,
	detail: {
		summary: 'Cosign Light Account Transaction',
		tags
	},
	response: {
		400: lightAccountResponseRejected,
		402: lightAccountResponsePayment
	}
};
