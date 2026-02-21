import { NameType } from '@wharfkit/antelope';
import { Contract, ContractKit } from '@wharfkit/contract';

import { getClient } from '$lib/wharf/client';

const TTL = 1000 * 60 * 60;
const cache = new Map<string, { contract: Contract; expires: number }>();

export function invalidateContractCache(...accounts: NameType[]) {
	if (accounts.length === 0) {
		cache.clear();
		return;
	}
	for (const account of accounts) {
		cache.delete(String(account));
	}
}

export async function getContract(account: NameType): Promise<Contract> {
	const key = String(account);
	const cached = cache.get(key);
	if (cached && cached.expires > Date.now()) return cached.contract;

	const kit = new ContractKit({ client: getClient() });
	const contract = await kit.load(key);
	if (!contract) {
		throw new Error(`Failed to load contract: ${key}`);
	}
	cache.set(key, { contract, expires: Date.now() + TTL });
	return contract;
}
