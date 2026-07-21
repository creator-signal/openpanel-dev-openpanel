import { db } from '@openpanel/db';

export async function getIsRegistrationAllowed(inviteId?: string | null) {
  // Mirrors OpenPanel's self-hosted policy for OIDC callback provisioning.
  if (process.env.ALLOW_REGISTRATION === undefined) {
    return true;
  }

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
