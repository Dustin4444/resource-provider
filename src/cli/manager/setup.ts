import { SigningRequest } from '@wharfkit/signing-request';
import { Command } from 'commander';

import { managerLog } from '$lib/logger';
import { makeLinkAuthAction, makeUpdateAuthAction } from '$lib/manager/setup';
import { objectify } from '$lib/utils';
import { getClient } from '$lib/wharf/client';
import { getManagerSession } from '$lib/wharf/session';
import {
	ANTELOPE_CHAIN_ID,
	ANTELOPE_NODEOS_API,
	ANTELOPE_SYSTEM_CONTRACT,
	explorers,
	MANAGER_ACCOUNT_NAME,
	MANAGER_BUYRAM_ACTION
} from 'src/config';
import { getManagerAccountStatus } from 'src/manager/manage/manager';

export async function runManagerSetup(): Promise<boolean> {
	if (!MANAGER_ACCOUNT_NAME) {
		managerLog.error(
			'MANAGER_ACCOUNT_NAME is not set. Please set this environment variable to the account name you wish to configure.'
		);
		return false;
	}
	if (!ANTELOPE_CHAIN_ID || !ANTELOPE_NODEOS_API) {
		managerLog.error(
			'ANTELOPE_CHAIN_ID and ANTELOPE_NODEOS_API must be set to configure the manager account.'
		);
		return false;
	}
	const manager = await getManagerSession();
	const data = await getClient().v1.chain.get_account(manager.actor);
	const status = getManagerAccountStatus(manager, data);

	const actions = [];
	if (status.requiresUpdateAuth) {
		actions.push(await makeUpdateAuthAction(manager, status.existingPermission));
	}
	if (status.requiresLinkAuthPowerup) {
		actions.push(await makeLinkAuthAction(manager, ANTELOPE_SYSTEM_CONTRACT, 'powerup'));
	}
	if (status.requiresLinkAuthBuyRAM) {
		actions.push(
			await makeLinkAuthAction(manager, ANTELOPE_SYSTEM_CONTRACT, MANAGER_BUYRAM_ACTION)
		);
	}

	if (!actions.length) {
		console.log('\n');
		console.log(
			'Setup not required. Manager account is already configured with the required permissions.'
		);
		console.log('\n');
		console.log('View current account permissions on Unicove using the URL below:');
		console.log('\n');
		console.log(`${explorers[ANTELOPE_CHAIN_ID]}/account/${manager.actor}/permissions`);
		return false;
	}

	managerLog.debug(
		'Manager Account Status',
		objectify({
			actor: manager.actor,
			permission: manager.permission,
			status
		})
	);

	const request = await SigningRequest.create({
		actions
	});

	console.log('\n');
	console.log(
		`The resource manager requires a dedicated "${manager.permission}" permission on the ${manager.actor} account. This permission isolates the manager's signing key from your active/owner keys, limiting it to only the actions needed for resource management.\n`
	);
	console.log('This transaction will:');
	if (status.requiresUpdateAuth) {
		console.log(
			`  - Create the "${manager.permission}" permission with the manager's public key under "active"`
		);
	}
	if (status.requiresLinkAuthPowerup) {
		console.log(
			`  - Authorize "${manager.permission}" to call ${ANTELOPE_SYSTEM_CONTRACT}::powerup (rent CPU/NET for managed accounts)`
		);
	}
	if (status.requiresLinkAuthBuyRAM) {
		console.log(
			`  - Authorize "${manager.permission}" to call ${ANTELOPE_SYSTEM_CONTRACT}::${MANAGER_BUYRAM_ACTION} (purchase RAM for managed accounts)`
		);
	}
	if (status.existingPermission) {
		console.log(
			`\nNote: An existing key was found on the "${manager.permission}" permission. It will be retained alongside the new key.`
		);
	}
	console.log('\nSign this transaction with the active permission of the account to apply:\n');
	if (explorers[ANTELOPE_CHAIN_ID]) {
		console.log(`${explorers[ANTELOPE_CHAIN_ID]}/prompt/${request.encode(false, false, '')}`);
	} else {
		console.log(`Using Anchor: ${request.encode()}`);
	}
	console.log('\nRun this command again after signing to verify the account is configured.');
	return true;
}

export function makeManagerSetupCommand() {
	const command = new Command('setup')
		.description('Create a signing request to configure account permissions for a specific service')
		.action(() => runManagerSetup());
	return command;
}
