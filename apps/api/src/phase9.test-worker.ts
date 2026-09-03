import { Hono } from 'hono';

import phase9 from './phase9.integration';
import phase9Lease from './phase9-lease.integration';

const app = new Hono();
app.route('/', phase9);
app.route('/', phase9Lease);

export default app;
