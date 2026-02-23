import { PrivateKey } from '@wharfkit/antelope';
import { eq } from 'drizzle-orm';
import type { Logger } from 'winston';

import { database } from '$lib/db';
import * as schema from '$lib/db/schema';
import { objectify } from '$lib/utils';

type ServiceAccountTable = typeof schema.provider | typeof schema.manager;

export interface ServiceAccountConfig {
	accountName: string;
	defaultPermission: string;
	envPermission?: string;
	envPrivateKey?: string;
	table: ServiceAccountTable;
	log: Logger;
}

export interface ServiceAccountData {
	account: string;
	permission: string;
	key: string;
}

export class ServiceAccount {
	constructor(private config: ServiceAccountConfig) {}

	async getAccount(): Promise<ServiceAccountData> {
		const { accountName, defaultPermission, envPermission, envPrivateKey, table, log } =
			this.config;

		const row = database.select().from(table).where(eq(table.account, accountName)).limit(1).get();

		if (!row) {
			const key = envPrivateKey || String(PrivateKey.generate('K1'));
			const permission = envPermission || defaultPermission;
			const values = { account: accountName, permission, key };

			log.debug(
				'Creating database entry for service account.',
				objectify({ ...values, key: PrivateKey.from(key).toPublic() })
			);

			await database.insert(table).values(values).onConflictDoUpdate({
				target: table.account,
				set: values
			});

			return values;
		}

		return {
			account: row.account,
			permission: envPermission || row.permission,
			key: envPrivateKey || row.key
		};
	}
}
