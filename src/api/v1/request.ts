import type { API, PermissionLevelType, TransactionHeader } from '@wharfkit/antelope';
import { Name, PermissionLevel, Transaction } from '@wharfkit/antelope';
import type { ResolvedSigningRequest, SigningRequest } from '@wharfkit/signing-request';
import type { Static } from 'elysia';

import { v1ResponseResources, v1ResponseTypes, v1ProviderRequestBody } from '$api/v1/types';
import { providerLog } from '$lib/logger';
import { objectify } from '$lib/utils';
import { getClient } from '$lib/wharf/client';
import { getProviderSession } from '$lib/wharf/session/provider';
import { createSigningRequest } from '$lib/wharf/signing-request';
import { PROVIDER_ACCOUNT_NAME, PROVIDER_ACCOUNT_PERMISSION } from 'src/config';

export function resolvePermissionLevel(signer: PermissionLevelType): PermissionLevel {
	if (!signer.actor || String(Name.from(signer.actor)) !== signer.actor) {
		throw new Error('Invalid actor in signer');
	}
	if (!signer.permission || String(Name.from(signer.permission)) !== signer.permission) {
		throw new Error('Invalid permission in signer');
	}
	return PermissionLevel.from({
		actor: signer.actor,
		permission: signer.permission
	});
}

export async function getSignerResources(requester: PermissionLevel) {
	const response = await getClient().v1.chain.get_account(requester.actor);
	providerLog.info('data', objectify(response));
	return {
		cpu: response.cpu_limit.max.subtracting(response.cpu_limit.current_used),
		net: response.net_limit.max.subtracting(response.net_limit.current_used),
		ram: response.ram_quota.subtracting(response.ram_usage)
	};
}

function cpuMedian(samples: API.v1.SendTransactionResponse[]): number {
	const estimates = samples.map((s) => s.processed.elapsed).sort((a, b) => a - b);
	const middle = Math.floor(estimates.length / 2);
	return estimates.length % 2 !== 0
		? estimates[middle]
		: Math.floor((estimates[middle - 1] + estimates[middle]) / 2);
}

function determineResourceNeeds(
	samples: API.v1.SendTransactionResponse[]
): Static<typeof v1ResponseResources> {
	const cpu = cpuMedian(samples);
	const net = samples[0].processed.net_usage;
	let ram = 0;
	const exception = samples[0].processed.except;
	if (exception && exception.name) {
		switch (exception.name) {
			case 'ram_usage_exceeded': {
				const data: {
					account: string;
					needs: number;
					available: number;
				} = exception.stack[0].data;
				const { available, needs } = data;
				const bytes = needs - available;
				ram = bytes;
				break;
			}
			default: {
				throw new Error(`${exception.name}: ${exception.message}`);
			}
		}
	}
	return { cpu, net, ram };
}

async function compute(
	transaction: Transaction,
	iterations: number = 5
): Promise<Static<typeof v1ResponseResources>> {
	const samples = await Promise.all(
		[...Array(iterations)].map(() => getClient().v1.chain.compute_transaction(transaction))
	);
	return determineResourceNeeds(samples);
}

async function getTransactionHeader(expireSeconds = 300): Promise<TransactionHeader> {
	const info = await getClient().v1.chain.get_info();
	return info.getTransactionHeader(expireSeconds);
}

async function resolveRequest(
	request: SigningRequest,
	requester: PermissionLevel
): Promise<ResolvedSigningRequest> {
	const abis = await request.fetchAbis();
	const header = await getTransactionHeader();
	return request.resolve(abis, requester, header);
}

async function resolveTransaction(
	request: SigningRequest,
	requester: PermissionLevel
): Promise<Transaction> {
	const resolved = await resolveRequest(request, requester);
	return Transaction.from(resolved.transaction);
}

function validateRequest(cosigner: PermissionLevel, request: SigningRequest): void {
	const actions = request.getRawActions();
	providerLog.debug('actions', JSON.stringify(actions));

	// Refuse identity requests
	if (request.isIdentity()) {
		throw new Error('Identity requests are not allowed.');
	}

	// Refuse requests that contain actions containing the cosigners authorization
	if (
		actions.some((action) => action.authorization.some((auth) => auth.actor.equals(cosigner.actor)))
	) {
		throw new Error('Actions cannot contain the authority of the cosigner.');
	}
}

function validateRequester(cosigner: PermissionLevel, requester: PermissionLevel): void {
	// Refuse to sign requests where the requestor is the same as the cosigner
	if (requester.actor.equals(cosigner.actor)) {
		throw new Error('Signer cannot be the cosigner.');
	}
}

async function handleRequest(
	request: SigningRequest,
	requester: PermissionLevel
): Promise<v1ResponseTypes> {
	const cosigner = PermissionLevel.from({
		actor: PROVIDER_ACCOUNT_NAME,
		permission: PROVIDER_ACCOUNT_PERMISSION
	});

	// Validate the request and requester
	validateRequest(cosigner, request);
	validateRequester(cosigner, requester);

	// Create a transaction to modify and use in the response
	const transaction = await resolveTransaction(request, requester);

	const resources = await compute(transaction);

	// Generate 2k drops (use RAM, force purchase)
	// gmNgZACDmJe-QFJr9uplSYxQIQYmKB0JE2C4wM7A4GBqnGqRlpaUamFqaZZqlmSRaJyUaG5smWZuaWRilpxkZmJiYGmSZmBqnJxikpaYkmhqamxuYWmZYpxsZG6WmJoMN40RCBkA

	// transaction = addFeeAction(transaction, requester, Asset.fromString('0.0001 EOS'))
	// transaction = addRAMAction(transaction, requester, UInt64.from(8192))
	// transaction = addNoopAction(transaction)

	const providerSession = getProviderSession();
	const signatures = await providerSession.signTransaction(transaction);

	return {
		code: 200,
		data: {
			request: ['transaction', transaction],
			resources,
			signatures: objectify(signatures)
		}
	};
}

export async function request({
	body
}: {
	body: Static<typeof v1ProviderRequestBody>;
}): Promise<v1ResponseTypes> {
	const request = await createSigningRequest(body);
	const requester = resolvePermissionLevel(body.signer);
	return handleRequest(request, requester);
}
