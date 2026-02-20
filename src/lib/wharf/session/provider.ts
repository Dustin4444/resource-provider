import { Checksum256, PrivateKey, Signature, Transaction } from '@wharfkit/antelope';

import {
	ANTELOPE_CHAIN_ID,
	ANTELOPE_NODEOS_API,
	PROVIDER_ACCOUNT_NAME,
	PROVIDER_ACCOUNT_PERMISSION,
	PROVIDER_ACCOUNT_PRIVATEKEY
} from 'src/config';

export interface ProviderSessionConfig {
	chainId: string;
	nodeosApi: string;
	accountName: string;
	accountPermission: string;
	privateKey: PrivateKey;
}

let providerConfig: ProviderSessionConfig | null = null;

export function getProviderConfig(): ProviderSessionConfig {
	if (providerConfig) {
		return providerConfig;
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

	providerConfig = {
		chainId: ANTELOPE_CHAIN_ID,
		nodeosApi: ANTELOPE_NODEOS_API,
		accountName: PROVIDER_ACCOUNT_NAME,
		accountPermission: PROVIDER_ACCOUNT_PERMISSION,
		privateKey: PrivateKey.from(PROVIDER_ACCOUNT_PRIVATEKEY)
	};

	return providerConfig;
}

export function resetProviderConfig(): void {
	providerConfig = null;
}

export function signTransaction(transaction: Transaction): Signature {
	const config = getProviderConfig();
	const digest = transaction.signingDigest(Checksum256.from(config.chainId));
	return config.privateKey.signDigest(digest);
}
