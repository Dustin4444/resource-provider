import { Transaction } from '@wharfkit/antelope';
import type { PermissionLevel, UInt64 } from '@wharfkit/antelope';

import { getContract } from '../contracts';

import { ANTELOPE_SYSTEM_CONTRACT } from 'src/config';

export async function addBuyRAMBytesAction(
	transaction: Transaction,
	requester: PermissionLevel,
	bytes: UInt64
): Promise<Transaction> {
	const systemContract = await getContract(ANTELOPE_SYSTEM_CONTRACT);
	const modified = Transaction.from(transaction);
	modified.actions.push(
		systemContract.action(
			'buyrambytes',
			{
				payer: requester.actor,
				receiver: requester.actor,
				bytes
			},
			{ authorization: [requester] }
		)
	);
	return modified;
}
