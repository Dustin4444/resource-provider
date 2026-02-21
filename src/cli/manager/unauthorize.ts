import { SigningRequest } from '@wharfkit/signing-request';
import { Command } from 'commander';

import { managerLog } from '$lib/logger';
import { makeDeleteAuthAction, makeUnlinkAuthAction } from '$lib/manager/setup';
import { objectify } from '$lib/utils';
import { getClient } from '$lib/wharf/client';
import { getManagerSession } from '$lib/wharf/session/manager';
import {
	ANTELOPE_CHAIN_ID,
	ANTELOPE_SYSTEM_CONTRACT,
	explorers,
	MANAGER_BUYRAM_ACTION
} from 'src/config';
import { getManagerAccountStatus } from 'src/manager/manage/manager';

export function makeManagerUnauthorizeCommand() {
	const command = new Command('unauthorize')
		.description(
			'Remove the resource management permissions from the manager account. The "manager setup" command will need to be run to re-enable resource management.'
		)
		.action(async () => {
			const manager = await getManagerSession();
			const data = await getClient().v1.chain.get_account(manager.actor);
			const status = getManagerAccountStatus(manager, data);

			const actions = [];
			if (!status.requiresLinkAuthPowerup) {
				actions.push(await makeUnlinkAuthAction(manager, ANTELOPE_SYSTEM_CONTRACT, 'powerup'));
			}
			if (!status.requiresLinkAuthBuyRAM) {
				actions.push(
					await makeUnlinkAuthAction(manager, ANTELOPE_SYSTEM_CONTRACT, MANAGER_BUYRAM_ACTION)
				);
			}
			if (!status.requiresUpdateAuth) {
				actions.push(await makeDeleteAuthAction(manager));
			}

			if (!actions.length) {
				console.log(
					'Unauthorize not required. Manager account is already missing the required permissions.'
				);
				console.log('\n');
				console.log('View current account permissions on Unicove using the URL below:');
				console.log('\n');
				console.log(`${explorers[ANTELOPE_CHAIN_ID]}/account/${manager.actor}/permissions`);
				return;
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

			console.log(
				'Complete the following transaction remove the permissions on the manager account:'
			);
			console.log('\n');
			if (explorers[ANTELOPE_CHAIN_ID]) {
				console.log(`${explorers[ANTELOPE_CHAIN_ID]}/prompt/${request.encode(false, false, '')}`);
			} else {
				console.log(`Using Anchor: ${request.encode()}`);
			}
		});
	return command;
}
