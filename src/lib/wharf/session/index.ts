import { Checksum256, PrivateKey, Session, Signature, Transaction } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';

import { managerAccount } from '$lib/db/models/manager/manager';
import { providerAccount } from '$lib/db/models/provider/provider';
import type { ServiceAccountData } from '$lib/db/models/service';
import { ANTELOPE_CHAIN_ID, ANTELOPE_NODEOS_API } from 'src/config';

function validateChainConfig(): void {
	if (!ANTELOPE_CHAIN_ID || !ANTELOPE_NODEOS_API) {
		throw new Error('Please set ANTELOPE_CHAIN_ID and ANTELOPE_NODEOS_API.');
	}
}

function createSession(account: ServiceAccountData): Session {
	return new Session({
		chain: {
			id: ANTELOPE_CHAIN_ID,
			url: ANTELOPE_NODEOS_API
		},
		permissionLevel: {
			actor: account.account,
			permission: account.permission
		},
		walletPlugin: new WalletPluginPrivateKey(account.key)
	});
}

let providerSession: Session | null = null;
let managerSession: Session | null = null;

export async function getProviderSession(): Promise<Session> {
	if (!providerSession) {
		validateChainConfig();
		providerSession = createSession(await providerAccount.getAccount());
	}
	return providerSession;
}

export async function getManagerSession(): Promise<Session> {
	if (!managerSession) {
		validateChainConfig();
		managerSession = createSession(await managerAccount.getAccount());
	}
	return managerSession;
}

export async function signTransaction(transaction: Transaction): Promise<Signature> {
	const session = await getProviderSession();
	const digest = transaction.signingDigest(Checksum256.from(session.chain.id));
	const privateKey = PrivateKey.from(session.walletPlugin.data.privateKey);
	return privateKey.signDigest(digest);
}
