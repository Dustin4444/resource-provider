import { Asset, Name, PermissionLevel, Transaction, UInt64 } from '@wharfkit/antelope';
import type { Static } from 'elysia';

import { lightAccountRequestBody } from './types';

import { providerLog } from '$lib/logger';
import { addBuyRAMBytesAction } from '$lib/wharf/actions/ram';
import { getContract, getStaleContract, invalidateContractCache } from '$lib/wharf/contracts';
import { RAM_SAFETY_BUFFER_BYTES, computeResourceNeeds } from '$lib/wharf/estimation';
import { calculateCosts, calculateTotalFee } from '$lib/wharf/pricing';
import { getProviderSession, signTransaction } from '$lib/wharf/session';
import { createSigningRequest, resolveTransaction } from '$lib/wharf/signing-request';
import {
	LIGHTACCOUNT_CONTRACT,
	LIGHTACCOUNT_FEE_MARGIN,
	LIGHTACCOUNT_FEE_RECIPIENT_KEY,
	LIGHTACCOUNT_KEYHOST
} from 'src/config';

function validateActions(transaction: Transaction, cosigner: PermissionLevel): void {
	const { actions } = transaction;

	if (actions.length === 0) {
		throw new Error('Transaction has no actions.');
	}

	for (const action of actions) {
		if (!action.account.equals(Name.from(LIGHTACCOUNT_CONTRACT!))) {
			throw new Error(`All actions must target ${LIGHTACCOUNT_CONTRACT}, found ${action.account}.`);
		}
	}

	if (!actions[0].name.equals('authkey')) {
		throw new Error('First action must be authkey.');
	}

	for (const action of actions) {
		if (action.authorization.some((auth) => auth.actor.equals(cosigner.actor))) {
			throw new Error('Transaction already contains the cosigner authorization.');
		}
	}
}

function validateCredentialId(actionData: Record<string, unknown>, credentialId: number): void {
	const ids = actionData.credential_ids as unknown[] | undefined;
	if (!ids || !Array.isArray(ids) || !ids.some((id) => Number(id) === credentialId)) {
		throw new Error(`credential_id ${credentialId} not found in authkey action credential_ids.`);
	}
}

function applyFeeMargin(fee: Asset): Asset {
	const margin = parseFloat(LIGHTACCOUNT_FEE_MARGIN);
	if (margin <= 0 || isNaN(margin)) {
		return fee;
	}
	if (margin === 1.0) {
		return fee;
	}
	const scaled = Asset.from(fee);
	const units = Number(scaled.units.value) * margin;
	scaled.units = UInt64.from(Math.ceil(units));
	return scaled;
}

async function processRequest(body: Static<typeof lightAccountRequestBody>): Promise<{
	code: 402;
	data: {
		costs: { cpu: string; net: string; ram: string };
		fee: string;
		request: [string, Transaction];
		resources: { cpu: number; net: number; ram: number };
		signatures: string[];
	};
}> {
	const signingRequest = await createSigningRequest(body);
	const session = await getProviderSession();
	const cosigner = session.permissionLevel;
	const credentialPermission = Name.from(UInt64.from(body.credential_id));
	const requester = PermissionLevel.from({
		actor: LIGHTACCOUNT_KEYHOST!,
		permission: credentialPermission
	});

	let transaction = await resolveTransaction(signingRequest, requester);
	providerLog.debug('Light account transaction resolved', {
		actions: transaction.actions.length
	});

	validateActions(transaction, cosigner);

	const lightacctContract = await getContract(LIGHTACCOUNT_CONTRACT!);
	const authkeyAction = transaction.actions[0];
	const decodedData = authkeyAction.decodeData(lightacctContract.abi);
	validateCredentialId(decodedData, body.credential_id);

	const modified = Transaction.from(transaction);
	modified.actions[0].authorization.unshift(cosigner);
	transaction = modified;

	const resourceNeeds = await computeResourceNeeds(transaction);
	providerLog.debug('Light account resource needs', resourceNeeds);

	if (resourceNeeds.ram > 0) {
		const ramBytes = UInt64.from(resourceNeeds.ram + RAM_SAFETY_BUFFER_BYTES);
		transaction = await addBuyRAMBytesAction(transaction, cosigner, ramBytes);
	}

	const costs = await calculateCosts(resourceNeeds);
	const baseFee = calculateTotalFee(costs);
	const fee = applyFeeMargin(baseFee);
	providerLog.debug('Light account fee', {
		base: String(baseFee),
		margin: LIGHTACCOUNT_FEE_MARGIN,
		final: String(fee)
	});

	const feeAction = lightacctContract.action(
		'send',
		{
			from_id: body.credential_id,
			to_key: LIGHTACCOUNT_FEE_RECIPIENT_KEY,
			quantity: Asset.from(fee),
			memo: 'resource fee'
		},
		{ authorization: [requester] }
	);

	const withFee = Transaction.from(transaction);
	withFee.actions.push(feeAction);
	transaction = withFee;

	const providerSignature = await signTransaction(transaction);

	providerLog.info('Provided resources (light account)', {
		credential_id: body.credential_id,
		cpu: resourceNeeds.cpu,
		net: resourceNeeds.net,
		fee: String(fee)
	});

	return {
		code: 402,
		data: {
			costs: {
				cpu: String(costs.cpu),
				net: String(costs.net),
				ram: String(costs.ram)
			},
			fee: String(fee),
			request: ['transaction', transaction],
			resources: { cpu: resourceNeeds.cpu, net: resourceNeeds.net, ram: resourceNeeds.ram },
			signatures: [String(providerSignature)]
		}
	};
}

export async function request({
	body,
	set
}: {
	body: Static<typeof lightAccountRequestBody>;
	set: { status: number };
}) {
	try {
		set.status = 402;
		return await processRequest(body);
	} catch (error) {
		const staleContract = getStaleContract(error);
		if (!staleContract) {
			providerLog.error('Light account request failed', { error: String(error) });
			throw error;
		}
		providerLog.warn('Stale ABI detected, retrying with fresh contract', {
			error: String(error),
			contract: staleContract
		});
		invalidateContractCache(staleContract);
		return processRequest(body);
	}
}
