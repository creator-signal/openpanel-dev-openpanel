import { db } from '@openpanel/db';

export async function getIsRegistrationAllowed(inviteId?: string | null) {
  // ALLOW_REGISTRATION is always undefined in OpenPanel Cloud.
  if (process.env.ALLOW_REGISTRATION === undefined) {
    return true;
  }

  // The first self-hosted user is always allowed.
  if ((await db.user.count()) === 0) {
    return true;
  }

  if (inviteId) {
    if (process.env.ALLOW_INVITATION === 'false') {
      return false;
    }
    return !!(await db.invite.findUnique({ where: { id: inviteId } }));
  }

  return process.env.ALLOW_REGISTRATION !== 'false';
}
