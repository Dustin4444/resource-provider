import { PrivateKey, Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';

import { managerAccount } from '$lib/db/models/manager/manager';
import { managerLog } from '$lib/logger';
import {
	ANTELOPE_CHAIN_ID,
	ANTELOPE_NODEOS_API,
	MANAGER_ACCOUNT_NAME,
	MANAGER_ACCOUNT_PERMISSION,
	MANAGER_ACCOUNT_PRIVATEKEY
} from 'src/config';

export async function getManagerSession(): Promise<Session> {
	const manager = await managerAccount.getManagerAccount();
	managerLog.silly('Loaded manager account', {
		account: manager.account,
		permission: manager.permission,
		key: String(PrivateKey.from(manager.key).toPublic())
	});
	return new Session({
		chain: {
			id: ANTELOPE_CHAIN_ID,
			url: ANTELOPE_NODEOS_API
		},
		permissionLevel: {
			actor: MANAGER_ACCOUNT_NAME,
			permission: MANAGER_ACCOUNT_PERMISSION || manager.permission
		},
		walletPlugin: new WalletPluginPrivateKey(MANAGER_ACCOUNT_PRIVATEKEY || manager.key)
	});
}
