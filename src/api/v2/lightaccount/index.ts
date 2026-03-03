import { Elysia } from 'elysia';

import { request } from './request';
import { lightAccountRequest } from './types';

export const lightaccount = new Elysia().post('/request_transaction', request, lightAccountRequest);
