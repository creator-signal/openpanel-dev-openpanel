import { oidcCallback } from '@creativesignal/openpanel/oidc/api-callback';
import type { FastifyPluginCallback } from 'fastify';
import * as controller from '@/controllers/oauth-callback.controller';

const router: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/github/callback',
    handler: controller.githubCallback,
  });
  fastify.route({
    method: 'GET',
    url: '/google/callback',
    handler: controller.googleCallback,
  });
  fastify.route({
    method: 'GET',
    url: '/oidc/callback',
    handler: oidcCallback,
  });
};

export default router;
