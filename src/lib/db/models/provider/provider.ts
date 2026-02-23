import { providerLog } from '$lib/logger';
import { ServiceAccount } from '$lib/db/models/service';
import * as schema from '$lib/db/schema';
import {
	PROVIDER_ACCOUNT_NAME,
	PROVIDER_ACCOUNT_PERMISSION,
	PROVIDER_ACCOUNT_PRIVATEKEY
} from 'src/config';

export const providerAccount = new ServiceAccount({
	accountName: PROVIDER_ACCOUNT_NAME!,
	defaultPermission: 'provider',
	envPermission: PROVIDER_ACCOUNT_PERMISSION,
	envPrivateKey: PROVIDER_ACCOUNT_PRIVATEKEY,
	table: schema.provider,
	log: providerLog
});
