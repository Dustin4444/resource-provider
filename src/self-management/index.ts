import { PrivateKey } from '@wharfkit/antelope';
import { Cron, type CronOptions } from 'croner';

import { generalLog } from '$lib/logger';
import { manageSelfResources, type SelfManagementConfig } from '$lib/self-management';
import { getClient } from '$lib/wharf/client';
import { getManagerSession } from '$lib/wharf/session';
import {
	ENABLE_SELF_MANAGEMENT,
	MANAGER_ACCOUNT_NAME,
	MANAGER_BUYRAM_ENABLED,
	MANAGER_INC_KB,
	MANAGER_INC_MS,
	MANAGER_MAX_FEE,
	MANAGER_MIN_KB,
	MANAGER_MIN_MS,
	MANAGER_RAM_MINIMUM_KB,
	MANAGER_SELF_CRONJOB
} from 'src/config';

const cronOptions: CronOptions = {
	catch: (e) => generalLog.error('Self-management cron failed', { error: String(e) }),
	protect: true
};

const selfConfig: SelfManagementConfig = {
	minMs: MANAGER_MIN_MS,
	minKb: MANAGER_MIN_KB,
	incMs: MANAGER_INC_MS,
	incKb: MANAGER_INC_KB,
	maxFee: MANAGER_MAX_FEE,
	buyramEnabled: MANAGER_BUYRAM_ENABLED,
	ramMinimumKb: MANAGER_RAM_MINIMUM_KB
};

async function selfManagementJob() {
	const session = await getManagerSession();
	await manageSelfResources(session, selfConfig);
}

async function verifyAccountPermission(): Promise<boolean> {
	const session = await getManagerSession();
	const publicKey = PrivateKey.from(session.walletPlugin.data.privateKey).toPublic();

	try {
		const accountData = await getClient().v1.chain.get_account(session.actor);
		const permission = accountData.permissions.find((p) => p.perm_name.equals(session.permission));
		if (!permission) {
			generalLog.error(
				`Self-Management: permission "${session.permission}" not found on account "${session.actor}". Run "manager setup" to configure the account.`
			);
			return false;
		}
		const keyAuthorized = permission.required_auth.keys.some((k) => k.key.equals(publicKey));
		if (!keyAuthorized) {
			generalLog.error(
				`Self-Management: key ${publicKey} is not authorized on "${session.actor}@${session.permission}". Run "manager setup" to configure the account.`
			);
			return false;
		}
	} catch (error) {
		generalLog.error(
			`Self-Management: unable to verify account "${session.actor}" on-chain: ${String(error)}`
		);
		return false;
	}

	return true;
}

export async function selfManagement() {
	if (!ENABLE_SELF_MANAGEMENT) {
		generalLog.info(
			'Self-Management Service is disabled. Set ENABLE_SELF_MANAGEMENT=false if you wish to disable this service.'
		);
		return;
	}

	if (!MANAGER_ACCOUNT_NAME) {
		generalLog.error('Self-Management requires MANAGER_ACCOUNT_NAME to be configured.');
		return;
	}

	const authorized = await verifyAccountPermission();
	if (!authorized) {
		return;
	}

	generalLog.info('Self-Management Service starting', { cron: MANAGER_SELF_CRONJOB });
	selfManagementJob();
	new Cron(MANAGER_SELF_CRONJOB, cronOptions, selfManagementJob);
}
