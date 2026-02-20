import { Transaction } from '@wharfkit/antelope';
import type { Asset, PermissionLevel } from '@wharfkit/antelope';

import { getContract } from '../contracts';

import { ANTELOPE_TOKEN_CONTRACT } from 'src/config';

export async function addFeeAction(
	transaction: Transaction,
	requester: PermissionLevel,
	recipient: PermissionLevel,
	fee: Asset,
	memo: string = 'Resource Provider Fee'
): Promise<Transaction> {
	const tokenContract = await getContract(ANTELOPE_TOKEN_CONTRACT);
	const modified = Transaction.from(transaction);
	const feeAction = tokenContract.action(
		'transfer',
		{
			from: requester.actor,
			to: recipient.actor,
			quantity: fee,
			memo
		},
		{ authorization: [requester] }
	);
	modified.actions.splice(1, 0, feeAction);
	return modified;
}
