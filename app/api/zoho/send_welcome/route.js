import { sendMessage } from '~/actions/twilio';
import { formatMobile, PhoneFormatter } from '~/utils';
import { logError } from '~/utils/logError';
import { notify } from '~/utils/notify';
import { prisma } from '~/utils/prisma';
import { findAdminStudioForStudio } from '~/utils/studio-lookups';

export async function POST(request) {
  try {
    const { leadId, ownerId, mobile, firstName } = await parseRequest(request);
    const studio = await getStudioFromZohoId(ownerId);

    if (!studio?.active) return new Response(null, { status: 200 });

    const admin = await findAdminStudioForStudio(studio.id);

    // For sub-studios, admin lookup MUST resolve. Silent fallback would
    // regress to per-studio numbers (the bug commit 8a6f7cb introduced).
    if (!studio.isAdmin && !admin) {
      const err = new Error(
        `welcome.admin_lookup_failed: no admin studio for non-admin studio ` +
        `${studio.name} (id=${studio.id}). Check StudioAccount join to twilio Account.`
      );
      await notify({
        type: 'welcome.admin_lookup_failed',
        data: { studioId: studio.id, studioName: studio.name, ownerId, leadId },
      });
      logError({
        message: 'welcome.admin_lookup_failed',
        error: err,
        level: 'error',
        data: { studioId: studio.id, studioName: studio.name },
      });
      throw err;
    }

    // Admins call themselves via the join (philip_admin / southlake_admin
    // self-link). Standalone admins fall through to studio.smsPhone.
    const smsPhone = admin?.smsPhone ?? studio.smsPhone;

    const contact = {
      id: leadId,
      fullName: firstName,
      mobile,
      smsOptOut: false,
      isLead: true,
    };

    const zohoWebhookId = await findOrCreateWelcomeMessage({
      contact,
      from: smsPhone,
      to: mobile,
      studioId: studio.id,
    });



    if (!zohoWebhookId) return new Response(null, { status: 200 });

    if (studio.smsPhone) {
      const message = createMessage(firstName, studio);

      await sendAndLogMessage(mobile, { smsPhone, id: studio.id }, message, zohoWebhookId, contact);
    } else {
      throw new Error('Can find studio sms phone');
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    logError({
      message: 'Error in send welcome',
      error,
      level: 'error',
      data: {},
    });
    return new Response(null, { status: 200 });
  }
}

function createMessage(
  first_name,
  { name: studioName, callPhone, managerName }
) {
  return studioName.includes('Design District') ? (
    `Hi ${first_name}! This is ` +
    `Fred Astaire Dance Studios ${studioName}. ` +
    `I would love to get you scheduled for your Introductory Program! ` +
    `We have limited space for new clients. ` +
    `Reply "YES" to book your first lesson! ` +
    `Or call us at ${PhoneFormatter.forDisplay(callPhone) || ''}. ` +
    `If you need to opt-out, reply "STOP"`
  ) : (
    `Hi ${first_name}! This is ${managerName} with ` +
    `Fred Astaire Dance Studios - ${studioName}. ` +
    `I would love to get you scheduled for your Introductory Program! ` +
    `We have limited space for new clients. ` +
    `Reply "YES" to book your first lesson! ` +
    `Or call us at ${PhoneFormatter.forDisplay(callPhone) || ''}. ` +
    `If you need to opt-out, reply "STOP"`
  );
}

async function sendAndLogMessage(
  mobile,
  { smsPhone, id: studioId },
  message,
  zohoWebhookId,
  contact
) {
  try {
    const response = await sendMessage({
      to: mobile,
      from: smsPhone,
      message,
      studioId,
      contact,
      messageId: zohoWebhookId,
    });

    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }
  } catch (error) {
    logError({
      message: 'Error sendAndLogMessagee:',
      error,
      level: 'error',
      data: { to: mobile, from: smsPhone, message, studioId },
    });
  }
}

export async function parseRequest(request) {
  const text = await request.text();
  const body = new URLSearchParams(text);
  const leadId = body.get('leadId');
  const ownerId = body.get('ownerId');
  const mobile = formatMobile(body.get('mobile'));
  const firstName = body.get('firstName');

  if (!leadId || !ownerId || !mobile || !firstName) {
    throw new Error('Invalid Zoho Webhook Message');
  }

  return { leadId, ownerId, mobile, firstName };
}

export async function getStudioFromZohoId(owner_id) {
  try {
    const studio = await prisma.studio.findFirst({
      where: { zohoId: owner_id },
      select: {
        id: true,
        zohoId: true,
        smsPhone: true,
        callPhone: true,
        name: true,
        managerName: true,
        active: true,
        isAdmin: true,
        twilioPhone: true,
      },
    });
    return studio;
  } catch (error) {
    logError({
      message: 'Could not find studio',
      error,
      level: 'warning',
      data: { owner_id },
    });
    throw new Error('Could not find studio');
  }
}

const findOrCreateWelcomeMessage = async ({ contact, from, to, studioId }) => {
  let message = await prisma.message.findFirst({
    where: {
      toNumber: to,
      isWelcomeMessage: true,
    },
    select: {
      id: true,
      twilioMessageId: true,
    },
  });

  if (message?.twilioMessageId) {
    console.log('Welcome message already sent');
    return null;
  }

  // If the record doesn't exist, create it
  if (!message) {
    message = await prisma.message.create({
      data: {
        contactId: contact?.id,
        studioId: studioId,
        fromNumber: formatMobile(from),
        toNumber: formatMobile(to),
        isWelcomeMessage: true,
      },
    });
  }
  return message.id;
};
