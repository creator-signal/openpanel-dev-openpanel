import { db } from '@openpanel/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getIsRegistrationAllowed } from './registration';

vi.mock('@openpanel/db', () => ({
  db: {
    invite: { findUnique: vi.fn() },
    user: { count: vi.fn() },
  },
}));

const countUsers = vi.mocked(db.user.count);
const findInvite = vi.mocked(db.invite.findUnique);

afterEach(() => {
  vi.resetAllMocks();
  delete process.env.ALLOW_REGISTRATION;
  delete process.env.ALLOW_INVITATION;
});

describe('self-hosted registration policy', () => {
  it('allows the first user even when registration is locked', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    countUsers.mockResolvedValue(0);
    await expect(getIsRegistrationAllowed()).resolves.toBe(true);
  });

  it('rejects an unknown user after registration is locked', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    countUsers.mockResolvedValue(1);
    await expect(getIsRegistrationAllowed()).resolves.toBe(false);
  });

  it('allows a valid invite when invitations are enabled', async () => {
    process.env.ALLOW_REGISTRATION = 'false';
    process.env.ALLOW_INVITATION = 'true';
    countUsers.mockResolvedValue(1);
    findInvite.mockResolvedValue({ id: 'invite-id' } as never);
    await expect(getIsRegistrationAllowed('invite-id')).resolves.toBe(true);
  });
});
