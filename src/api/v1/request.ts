import type { API, PermissionLevelType, TransactionHeader } from '@wharfkit/antelope';
import { Asset, Name, PermissionLevel, Transaction, UInt64 } from '@wharfkit/antelope';
import { PowerUpState } from '@wharfkit/resources';
import type { ResolvedSigningRequest, SigningRequest } from '@wharfkit/signing-request';
import type { Static } from 'elysia';

import { v1ProviderRequestBody } from '$api/v1/types';
import type { v1ResponseTypes } from '$api/v1/types';
import { usageDatabase } from '$lib/db/models/provider/usage';
import { providerLog } from '$lib/logger';
import { objectify } from '$lib/utils';
import { addFeeAction } from '$lib/wharf/actions/fee';
import { addNoopAction } from '$lib/wharf/actions/noop';
import { addBuyRAMBytesAction } from '$lib/wharf/actions/ram';
import { getClient } from '$lib/wharf/client';
import { invalidateContractCache } from '$lib/wharf/contracts';
import { getResourcesClient } from '$lib/wharf/resources';
import { getProviderSession, signTransaction } from '$lib/wharf/session';
import { createSigningRequest } from '$lib/wharf/signing-request';
import {
	ANTELOPE_SYSTEM_TOKEN,
	ENABLE_FREE_TRANSACTIONS,
	ENABLE_PAID_TRANSACTIONS,
	PROVIDER_FREE_TRANSACTIONS_LIMIT_KB,
	PROVIDER_FREE_TRANSACTIONS_LIMIT_MS,
	PROVIDER_MIN_CPU_US,
	PROVIDER_MIN_NET_BYTES,
	PROVIDER_PAID_TRANSACTIONS_FEE_DEFAULT_REF,
	PROVIDER_PAID_TRANSACTIONS_FEE_MEMO,
	PROVIDER_PAID_TRANSACTIONS_FEE_RECIPIENT,
	PROVIDER_PAID_TRANSACTIONS_MINIMUM_FEE,
	PROVIDER_REQUIRE_RESOURCE_NEED
} from 'src/config';

const ABI_ERROR_PATTERNS = [
	/Missing ABI definition for (\S+)/,
	/Missing type for action (\S+?):/,
	/Contract \((\S+?)\) does not have an action named/,
	/does not exist on the ABI provided/,
	/Encoding error at /
];

function getStaleContract(error: unknown): string | undefined {
	const message = error instanceof Error ? error.message : String(error);
	for (const pattern of ABI_ERROR_PATTERNS) {
		const match = message.match(pattern);
		if (match) return match[1];
	}
	return undefined;
}

interface ResourceNeeds {
	cpu: number;
	net: number;
	ram: number;
}

interface ResourceCosts {
	cpu: Asset;
	net: Asset;
	ram: Asset;
}

const RAM_SAFETY_BUFFER_BYTES = 50;

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

async function getSignerAccountData(requester: PermissionLevel): Promise<API.v1.AccountObject> {
	return getClient().v1.chain.get_account(requester.actor);
}

function checkResourceSufficiency(accountData: API.v1.AccountObject): void {
	if (!PROVIDER_REQUIRE_RESOURCE_NEED) {
		return;
	}

	const cpuAvailable = Number(
		accountData.cpu_limit.max.subtracting(accountData.cpu_limit.current_used)
	);
	const netAvailable = Number(
		accountData.net_limit.max.subtracting(accountData.net_limit.current_used)
	);

	if (cpuAvailable > PROVIDER_MIN_CPU_US && netAvailable > PROVIDER_MIN_NET_BYTES) {
		throw new Error('Network resources not required by this account.');
	}
}

function cpuMedian(samples: API.v1.SendTransactionResponse[]): number {
	const estimates = samples.map((s) => s.processed.elapsed).sort((a, b) => a - b);
	const middle = Math.floor(estimates.length / 2);
	return estimates.length % 2 !== 0
		? estimates[middle]
		: Math.floor((estimates[middle - 1] + estimates[middle]) / 2);
}

function determineResourceNeeds(samples: API.v1.SendTransactionResponse[]): ResourceNeeds {
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
				ram = needs - available;
				break;
			}
			default: {
				const frame = exception.stack?.[0];
				let detail = frame?.format ?? exception.message;
				if (frame?.data) {
					for (const [key, value] of Object.entries(frame.data)) {
						detail = detail.replace(`\${${key}}`, String(value));
					}
				}
				providerLog.debug('compute_transaction exception', {
					name: exception.name,
					message: exception.message,
					stack: exception.stack
				});
				throw new Error(`${exception.name}: ${detail}`);
			}
		}
	}
	return { cpu, net, ram };
}

async function computeResourceNeeds(
	transaction: Transaction,
	iterations = 5
): Promise<ResourceNeeds> {
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
	providerLog.debug('Validating request actions', { actionCount: actions.length });

	if (request.isIdentity()) {
		throw new Error('Identity requests are not allowed.');
	}

	if (
		actions.some((action) => action.authorization.some((auth) => auth.actor.equals(cosigner.actor)))
	) {
		throw new Error('Actions cannot contain the authority of the cosigner.');
	}
}

function validateRequester(cosigner: PermissionLevel, requester: PermissionLevel): void {
	if (requester.actor.equals(cosigner.actor)) {
		throw new Error('Signer cannot be the cosigner.');
	}
}

async function checkQuota(account: string, resourceNeeds: ResourceNeeds): Promise<boolean> {
	if (!ENABLE_FREE_TRANSACTIONS) {
		return false;
	}

	const currentUsage = await usageDatabase.getUsage(account);
	const cpuLimit = Number(PROVIDER_FREE_TRANSACTIONS_LIMIT_MS) * 1000;
	const netLimit = Number(PROVIDER_FREE_TRANSACTIONS_LIMIT_KB) * 1000;

	const projectedCpu = currentUsage.cpu + resourceNeeds.cpu;
	const projectedNet = currentUsage.net + resourceNeeds.net;

	const withinQuota = projectedCpu <= cpuLimit && projectedNet <= netLimit;

	providerLog.debug('Quota check', {
		account,
		currentUsage,
		resourceNeeds,
		limits: { cpu: cpuLimit, net: netLimit },
		withinQuota
	});

	return withinQuota;
}

async function calculateCosts(resourceNeeds: ResourceNeeds): Promise<ResourceCosts> {
	const resourcesClient = getResourcesClient();
	const powerupState = await resourcesClient.v1.powerup.get_state();
	const powerup = PowerUpState.from(powerupState);
	const sample = await resourcesClient.getSampledUsage();

	const cpuMs = resourceNeeds.cpu / 1000;
	const netKb = resourceNeeds.net / 1000;

	const zeroCost = () => Asset.from(0, ANTELOPE_SYSTEM_TOKEN);

	let cpuCost: Asset;
	try {
		cpuCost =
			cpuMs > 0
				? Asset.fromFloat(powerup.cpu.price_per_ms(sample, cpuMs), ANTELOPE_SYSTEM_TOKEN)
				: zeroCost();
	} catch {
		cpuCost = zeroCost();
	}

	let netCost: Asset;
	try {
		netCost =
			netKb > 0
				? Asset.fromFloat(powerup.net.price_per_kb(sample, netKb), ANTELOPE_SYSTEM_TOKEN)
				: zeroCost();
	} catch {
		netCost = zeroCost();
	}

	let ramCost = Asset.from(0, ANTELOPE_SYSTEM_TOKEN);
	if (resourceNeeds.ram > 0) {
		const ramState = await resourcesClient.v1.ram.get_state();
		ramCost = ramState.price_per_kb(resourceNeeds.ram / 1024);
	}

	providerLog.debug('Cost calculations', objectify({ cpuCost, netCost, ramCost }));

	return { cpu: cpuCost, net: netCost, ram: ramCost };
}

function calculateTotalFee(costs: ResourceCosts): Asset {
	const total = Asset.from(0, ANTELOPE_SYSTEM_TOKEN);
	total.units.add(costs.cpu.units);
	total.units.add(costs.net.units);
	total.units.add(costs.ram.units);

	if (PROVIDER_PAID_TRANSACTIONS_MINIMUM_FEE) {
		const minimumFee = Asset.from(PROVIDER_PAID_TRANSACTIONS_MINIMUM_FEE);
		if (total.units.lte(minimumFee.units)) {
			return minimumFee;
		}
	}

	return total;
}

async function processRequest(
	request: SigningRequest,
	requester: PermissionLevel,
	cosigner: PermissionLevel,
	ref?: string
): Promise<v1ResponseTypes> {
	let accountData: API.v1.AccountObject;
	try {
		accountData = await getSignerAccountData(requester);
	} catch {
		throw new Error(`Unable to retrieve account data for ${requester.actor}.`);
	}
	providerLog.debug('Account data retrieved', { account: String(requester.actor) });

	checkResourceSufficiency(accountData);
	providerLog.debug('Resource sufficiency check passed');

	let transaction = await resolveTransaction(request, requester);
	providerLog.debug('Transaction resolved', { actions: transaction.actions.length });

	transaction = await addNoopAction(transaction, cosigner);
	providerLog.debug('Noop action added');

	const resourceNeeds = await computeResourceNeeds(transaction);
	providerLog.debug('Resource needs computed', resourceNeeds);

	if (resourceNeeds.ram > 0) {
		const ramBytes = UInt64.from(resourceNeeds.ram + RAM_SAFETY_BUFFER_BYTES);
		transaction = await addBuyRAMBytesAction(transaction, requester, ramBytes);
	}

	const withinQuota = await checkQuota(String(requester.actor), resourceNeeds);

	if (withinQuota) {
		providerLog.debug('Within free quota, signing transaction');
		const providerSignature = await signTransaction(transaction);
		await usageDatabase.incrementUsage(
			String(requester.actor),
			resourceNeeds.cpu,
			resourceNeeds.net
		);

		providerLog.info('Provided resources (free)', { account: String(requester.actor), cpu: resourceNeeds.cpu, net: resourceNeeds.net });
		return {
			code: 200,
			data: {
				request: ['transaction', transaction],
				resources: { cpu: resourceNeeds.cpu, net: resourceNeeds.net, ram: resourceNeeds.ram },
				signatures: [String(providerSignature)]
			}
		};
	}

	if (!ENABLE_PAID_TRANSACTIONS) {
		throw new Error(
			ENABLE_FREE_TRANSACTIONS
				? 'Free transaction quota exceeded.'
				: 'Resource provider is not accepting requests at this time.'
		);
	}

	providerLog.debug('Exceeds free quota, calculating paid costs');
	const costs = await calculateCosts(resourceNeeds);
	const totalFee = calculateTotalFee(costs);
	const providerFee = calculateTotalFee({ cpu: costs.cpu, net: costs.net, ram: Asset.from(0, ANTELOPE_SYSTEM_TOKEN) });
	providerLog.debug('Fee calculated', { fee: String(totalFee), providerFee: String(providerFee) });

	const feeRef = ref || PROVIDER_PAID_TRANSACTIONS_FEE_DEFAULT_REF;
	const feeMemo = feeRef
		? `${PROVIDER_PAID_TRANSACTIONS_FEE_MEMO} | ref=${feeRef}`
		: PROVIDER_PAID_TRANSACTIONS_FEE_MEMO;

	transaction = await addFeeAction(
		transaction,
		requester,
		PROVIDER_PAID_TRANSACTIONS_FEE_RECIPIENT || cosigner.actor,
		providerFee,
		feeMemo
	);

	const providerSignature = await signTransaction(transaction);

	providerLog.info('Provided resources (paid)', { account: String(requester.actor), cpu: resourceNeeds.cpu, net: resourceNeeds.net, fee: String(providerFee) });
	return {
		code: 402,
		data: {
			costs: {
				cpu: String(costs.cpu),
				net: String(costs.net),
				ram: String(costs.ram)
			},
			fee: String(totalFee),
			request: ['transaction', transaction],
			resources: { cpu: resourceNeeds.cpu, net: resourceNeeds.net, ram: resourceNeeds.ram },
			signatures: [String(providerSignature)]
		}
	};
}

export async function request({
	body
}: {
	body: Static<typeof v1ProviderRequestBody>;
}): Promise<v1ResponseTypes> {
	const signingRequest = await createSigningRequest(body);
	const requester = resolvePermissionLevel(body.signer);
	const session = await getProviderSession();
	const cosigner = session.permissionLevel;

	providerLog.debug('Processing request', {
		requester: String(requester),
		cosigner: String(cosigner)
	});

	validateRequest(cosigner, signingRequest);
	validateRequester(cosigner, requester);

	try {
		return await processRequest(signingRequest, requester, cosigner, body.ref);
	} catch (error) {
		const staleContract = getStaleContract(error);
		if (!staleContract) {
			providerLog.error('Request failed', { error: String(error) });
			throw error;
		}
		providerLog.warn('Stale ABI detected, retrying with fresh contract', {
			error: String(error),
			contract: staleContract
		});
		invalidateContractCache(staleContract);
		return processRequest(signingRequest, requester, cosigner, body.ref);
	}
}
