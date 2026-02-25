import { usageDatabase } from '$lib/db/models/provider/usage';
import {
	PROVIDER_FREE_TRANSACTIONS_LIMIT_KB,
	PROVIDER_FREE_TRANSACTIONS_LIMIT_MS,
	PROVIDER_USAGE_WINDOW_HOURS
} from 'src/config';

export async function usage({ params }: { params: { account: string } }) {
	const currentUsage = await usageDatabase.getUsage(params.account);

	return {
		account: params.account,
		usage: {
			cpu: currentUsage.cpu,
			net: currentUsage.net
		},
		quota: {
			cpu: Number(PROVIDER_FREE_TRANSACTIONS_LIMIT_MS) * 1000,
			net: Number(PROVIDER_FREE_TRANSACTIONS_LIMIT_KB) * 1000
		},
		window: {
			hours: PROVIDER_USAGE_WINDOW_HOURS
		}
	};
}
