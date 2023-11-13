import {
  createTask,
  getStudioData,
  lookupLead,
  getZohoAccount,
} from '~/actions/zoho';
import { logError } from '~/utils/rollbar';
import { parse } from 'querystring';

const sandboxNumbers = ['+18559191285'];

export async function POST(request) {
  const body = await request.text();
  const res = parse(body);
  const { To: to, From: from, Body: msg } = res;
  console.log('webhook hit', { to, from, msg });

  const sandbox = sandboxNumbers.includes(to);

  try {
    const { id: studioId } = await getStudioData({
      phone: to.replace('+1', ''),
    });

    if (studioId) {
      console.log('sudioId', studioId);
      getZohoAccount(studioId);
    }
    // if (studioId) {
    //   const lead = await lookupLead({ from, sandbox, studioId });
    //   console.log({ lead });
    //   createTask({ studioId, lead, message: { to, from, msg } });
    // }
  } catch (error) {
    logError(error);
  }
  return new Response(null, { status: 200 });
}
