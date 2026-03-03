import { ABICache } from '@wharfkit/abicache';
import { Name, PackedTransaction, PermissionLevel, Transaction } from '@wharfkit/antelope';
import type { TransactionHeader } from '@wharfkit/antelope';
import { SigningRequest } from '@wharfkit/signing-request';
import type { ResolvedSigningRequest } from '@wharfkit/signing-request';
import type { Static } from 'elysia';

import { getClient } from './client';

import { generalLog } from '$lib/logger';
import type { TPackedTransaction, TTransaction } from '$lib/types';

function getCache() {
	return new ABICache(getClient());
}

export function getOpts() {
	const cache = getCache();
	return {
		zlib: {
			deflateRaw: (data: Uint8Array) => Bun.deflateSync(Buffer.from(data)),
			inflateRaw: (data: Uint8Array) => Bun.inflateSync(Buffer.from(data))
		},
		abiProvider: cache
	};
}

export async function createSigningRequestFromString(request: string): Promise<SigningRequest> {
	generalLog.debug('createSigningRequestFromString', { request });
	let payload = request;
	if (!request.startsWith('esr:')) {
		payload = 'esr://' + request;
	}
	return SigningRequest.from(payload, getOpts());
}

export async function createSigningRequestFromPackedTransaction(
	packedTransaction: Static<typeof TPackedTransaction>
): Promise<SigningRequest> {
	generalLog.debug('createSigningRequestFromPackedTransaction', { packedTransaction });
	const decoded = PackedTransaction.from(packedTransaction);
	return await SigningRequest.create(
		{
			transaction: decoded.getTransaction()
		},
		getOpts()
	);
}

export async function createSigningRequestFromTransaction(
	transaction: Static<typeof TTransaction>
): Promise<SigningRequest> {
	generalLog.debug('createSigningRequestFromTransaction', { transaction });
	const contracts = transaction.actions.map((action) => Name.from(action.account));
	const abis = await Promise.all(
		contracts.map(async (account) => ({
			contract: account,
			abi: await getCache().getAbi(Name.from(account))
		}))
	);
	return await SigningRequest.create(
		{
			transaction: Transaction.from(transaction, abis)
		},
		getOpts()
	);
}

export interface SigningRequestInput {
	request?: string;
	transaction?: Static<typeof TTransaction>;
	packedTransaction?: Static<typeof TPackedTransaction>;
}

export async function createSigningRequest(body: SigningRequestInput): Promise<SigningRequest> {
	generalLog.debug('createSigningRequest', { body });
	try {
		if (body.request) {
			return await createSigningRequestFromString(body.request);
		}

		if (body.transaction) {
			return await createSigningRequestFromTransaction(body.transaction);
		}

		if (body.packedTransaction) {
			return createSigningRequestFromPackedTransaction(body.packedTransaction);
		}
	} catch (error) {
		throw new Error('Error parsing request: ' + String(error));
	}

	throw new Error('No valid request found');
}

export async function getTransactionHeader(expireSeconds = 300): Promise<TransactionHeader> {
	const info = await getClient().v1.chain.get_info();
	return info.getTransactionHeader(expireSeconds);
}

export async function resolveRequest(
	request: SigningRequest,
	requester: PermissionLevel
): Promise<ResolvedSigningRequest> {
	const abis = await request.fetchAbis();
	const header = await getTransactionHeader();
	return request.resolve(abis, requester, header);
}

export async function resolveTransaction(
	request: SigningRequest,
	requester: PermissionLevel
): Promise<Transaction> {
	const resolved = await resolveRequest(request, requester);
	return Transaction.from(resolved.transaction);
}
