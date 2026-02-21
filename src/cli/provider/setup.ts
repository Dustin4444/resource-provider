import { API } from '@wharfkit/antelope';
import { Session } from '@wharfkit/session';
import { SigningRequest } from '@wharfkit/signing-request';
import { Command } from 'commander';

import { providerLog } from '$lib/logger';
import { makeLinkAuthAction, makeUpdateAuthAction } from '$lib/manager/setup';
import { objectify } from '$lib/utils';
import { getClient } from '$lib/wharf/client';
import { getProviderSession } from '$lib/wharf/session/provider';
import {
	ANTELOPE_CHAIN_ID,
	ANTELOPE_NODEOS_API,
	ANTELOPE_NOOP_CONTRACT,
	explorers,
	PROVIDER_ACCOUNT_NAME,
	PROVIDER_ACCOUNT_PRIVATEKEY
} from 'src/config';

interface ProviderAccountStatus {
	requiresUpdateAuth: boolean;
	requiresLinkAuthNoop: boolean;
	existingPermission?: API.v1.AccountPermission;
}

function getProviderAccountStatus(
	provider: Session,
	data: API.v1.AccountObject
): ProviderAccountStatus {
	const status: ProviderAccountStatus = {
		requiresUpdateAuth: false,
		requiresLinkAuthNoop: false
	};

	status.existingPermission = data.permissions.find((p) => p.perm_name.equals(provider.permission));

	if (!status.existingPermission) {
		status.requiresUpdateAuth = true;
		status.requiresLinkAuthNoop = true;
	} else {
		const matchingKey = status.existingPermission.required_auth.keys.find((k) => {
			return k.key.equals(provider.walletPlugin.data.privateKey.toPublic());
		});
		if (!matchingKey) {
			status.requiresUpdateAuth = true;
		}

		const noopLinked = status.existingPermission.linked_actions.find(
			(a) => a.account.equals(ANTELOPE_NOOP_CONTRACT) && a.action.equals('noop')
		);
		if (!noopLinked) {
			status.requiresLinkAuthNoop = true;
		}
	}

	return status;
}

export async function runProviderSetup(): Promise<boolean> {
	if (!PROVIDER_ACCOUNT_NAME) {
		providerLog.error(
			'PROVIDER_ACCOUNT_NAME is not set. Please set this environment variable to the account name you wish to configure.'
		);
		return false;
	}
	if (!ANTELOPE_CHAIN_ID || !ANTELOPE_NODEOS_API) {
		providerLog.error(
			'ANTELOPE_CHAIN_ID and ANTELOPE_NODEOS_API must be set to configure the provider account.'
		);
		return false;
	}
	if (!PROVIDER_ACCOUNT_PRIVATEKEY) {
		providerLog.error(
			'PROVIDER_ACCOUNT_PRIVATEKEY is not set. Please set this environment variable to the private key for the provider account.'
		);
		return false;
	}
	const provider = getProviderSession();
	const data = await getClient().v1.chain.get_account(provider.actor);
	const status = getProviderAccountStatus(provider, data);

	const actions = [];
	if (status.requiresUpdateAuth) {
		actions.push(await makeUpdateAuthAction(provider, status.existingPermission));
	}
	if (status.requiresLinkAuthNoop) {
		actions.push(await makeLinkAuthAction(provider, ANTELOPE_NOOP_CONTRACT, 'noop'));
	}

	if (!actions.length) {
		console.log('\n');
		console.log(
			'Setup not required. Provider account is already configured with the required permissions.'
		);
		console.log('\n');
		console.log('View current account permissions on Unicove using the URL below:');
		console.log('\n');
		console.log(`${explorers[ANTELOPE_CHAIN_ID]}/account/${provider.actor}/permissions`);
		return false;
	}

	providerLog.debug(
		'Provider Account Status',
		objectify({
			actor: provider.actor,
			permission: provider.permission,
			status
		})
	);

	const request = await SigningRequest.create({
		actions
	});

	console.log('\n');
	console.log(
		`The resource provider requires a dedicated "${provider.permission}" permission on the ${provider.actor} account. This permission isolates the provider's signing key from your active/owner keys, limiting it to only the noop action used for transaction cosigning.\n`
	);
	console.log('This transaction will:');
	if (status.requiresUpdateAuth) {
		console.log(
			`  - Create the "${provider.permission}" permission with the provider's public key under "active"`
		);
	}
	if (status.requiresLinkAuthNoop) {
		console.log(
			`  - Authorize "${provider.permission}" to call ${ANTELOPE_NOOP_CONTRACT}::noop (cosign transactions for requesting accounts)`
		);
	}
	if (status.existingPermission) {
		console.log(
			`\nNote: An existing key was found on the "${provider.permission}" permission. It will be retained alongside the new key.`
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

export function makeProviderSetupCommand() {
	const command = new Command('setup')
		.description(
			'Create a signing request to configure account permissions for the resource provider'
		)
		.action(() => runProviderSetup());
	return command;
}
