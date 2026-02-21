import { Checksum256, PrivateKey, Session, Signature, Transaction } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';

import {
	ANTELOPE_CHAIN_ID,
	ANTELOPE_NODEOS_API,
	PROVIDER_ACCOUNT_NAME,
	PROVIDER_ACCOUNT_PERMISSION,
	PROVIDER_ACCOUNT_PRIVATEKEY
} from 'src/config';

let providerSession: Session | null = null;

export function getProviderSession(): Session {
	if (providerSession) {
		return providerSession;
	}

	if (
		!ANTELOPE_CHAIN_ID ||
		!ANTELOPE_NODEOS_API ||
		!PROVIDER_ACCOUNT_NAME ||
		!PROVIDER_ACCOUNT_PERMISSION ||
		!PROVIDER_ACCOUNT_PRIVATEKEY
	) {
		throw new Error(
			'Provider not configured. Please set the environment variables ANTELOPE_CHAIN_ID, ANTELOPE_NODEOS_API, PROVIDER_ACCOUNT_NAME, PROVIDER_ACCOUNT_PERMISSION, and PROVIDER_ACCOUNT_PRIVATEKEY.'
		);
	}

	providerSession = new Session({
		chain: {
			id: ANTELOPE_CHAIN_ID,
			url: ANTELOPE_NODEOS_API
		},
		permissionLevel: {
			actor: PROVIDER_ACCOUNT_NAME,
			permission: PROVIDER_ACCOUNT_PERMISSION
		},
		walletPlugin: new WalletPluginPrivateKey(PROVIDER_ACCOUNT_PRIVATEKEY)
	});

	return providerSession;
}

export function signTransaction(transaction: Transaction): Signature {
	const session = getProviderSession();
	const digest = transaction.signingDigest(Checksum256.from(session.chain.id));
	const privateKey = PrivateKey.from(session.walletPlugin.data.privateKey);
	return privateKey.signDigest(digest);
}
