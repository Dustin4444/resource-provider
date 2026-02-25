import { providerLog } from '$lib/logger';
import { getClient } from '$lib/wharf/client';
import { getProviderSession } from '$lib/wharf/session';
import {
	ANTELOPE_NOOP_CONTRACT,
	ENABLE_FREE_TRANSACTIONS,
	ENABLE_PAID_TRANSACTIONS
} from 'src/config';

export async function validateProviderAccount(): Promise<boolean> {
	const session = await getProviderSession();
	const data = await getClient().v1.chain.get_account(session.actor);

	const permission = data.permissions.find((p) => p.perm_name.equals(session.permission));
	if (!permission) {
		providerLog.error(
			`Provider account "${session.actor}" is missing the "${session.permission}" permission. Run "provider setup" to configure the account.`
		);
		return false;
	}

	if (ENABLE_FREE_TRANSACTIONS || ENABLE_PAID_TRANSACTIONS) {
		const noopLinked = permission.linked_actions.find(
			(a) => a.account.equals(ANTELOPE_NOOP_CONTRACT) && a.action.equals('noop')
		);
		if (!noopLinked) {
			providerLog.error(
				`Provider permission "${session.permission}" is not linked to ${ANTELOPE_NOOP_CONTRACT}::noop. Run "provider setup" to configure the account.`
			);
			return false;
		}
	}

	return true;
}
