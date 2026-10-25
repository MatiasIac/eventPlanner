import type { Context } from '@netlify/functions';
import { handle } from '../../server/api';
import { deployment } from '../../server/runtime';
export default (request: Request, context: Context) => deployment.run(context.deploy, () => handle(request, context.ip));
