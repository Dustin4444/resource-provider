import { ServiceAccount } from '$lib/db/models/service';
import * as schema from '$lib/db/schema';
import { managerLog } from '$lib/logger';
import {
	MANAGER_ACCOUNT_NAME,
	MANAGER_ACCOUNT_PERMISSION,
	MANAGER_ACCOUNT_PRIVATEKEY
} from 'src/config';

export const managerAccount = new ServiceAccount({
	accountName: MANAGER_ACCOUNT_NAME!,
	defaultPermission: 'manager',
	envPermission: MANAGER_ACCOUNT_PERMISSION,
	envPrivateKey: MANAGER_ACCOUNT_PRIVATEKEY,
	table: schema.manager,
	log: managerLog
});
