export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { agentLanguageCodes } from '@/types/agent'

/**
 * Public OpenAPI 3.1 spec for the LivoCall REST API.
 *
 * We hand-maintain this (rather than generating from zod) so the contract is
 * stable and independent of route refactors. Every path below maps 1:1 to a
 * route under `/api/v1/*` and is covered by an apiKey + scope check.
 */
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'LivoCall Public API',
    version: '1.0.0',
    description:
      'HTTPS API for programmatic access to LivoCall. All endpoints require a ' +
      '`Authorization: Bearer <api_key>` header with an API key minted from ' +
      'the dashboard. Automate calls, agents, campaigns, contacts, SIP numbers, KB, DNC and webhooks. ' +
      'Rate limit: 60 req/min + 5 req/s burst per key.',
  },
  servers: [
    { url: 'https://{host}', variables: { host: { default: 'app.bd.voice' } } },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API Key' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { nullable: true },
            },
            required: ['code', 'message'],
          },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          tier: { type: 'string', enum: ['gemini_live', 'grok_voice', 'pipeline', 'dtmf'] },
          language: { type: 'string' },
          voice: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'live'] },
        },
      },
      AgentCreate: {
        type: 'object',
        required: ['name', 'tier'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          tier: { type: 'string', enum: ['gemini_live', 'grok_voice', 'pipeline', 'dtmf'] },
          model: { type: 'string' },
          language: { type: 'string', enum: agentLanguageCodes },
          prompt: {
            type: 'object',
            properties: {
              system: { type: 'string' },
              firstMessage: { type: 'string' },
              guardrails: { type: 'string' },
            },
          },
        },
      },
      Call: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          agentId: { type: 'string' },
          toE164: { type: 'string' },
          fromE164: { type: 'string' },
          tier: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          outcome: { type: 'string', nullable: true },
          summary: { type: 'string', nullable: true },
          sentiment: { type: 'string', nullable: true },
          audioUrl: { type: 'string', nullable: true },
        },
      },
      PhoneNumber: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          e164: { type: 'string' },
          providerSlug: { type: 'string' },
          inboundEnabled: { type: 'boolean' },
          outboundEnabled: { type: 'boolean' },
          agentId: { type: 'string', nullable: true },
        },
      },
      Contact: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          e164: { type: 'string' },
          name: { type: 'string' },
          locale: { type: 'string', enum: ['bn', 'en', 'mixed'] },
          tags: { type: 'array', items: { type: 'string' } },
          attrs: { type: 'object' },
        },
      },
      Campaign: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          agentId: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'running', 'paused', 'completed'] },
          concurrency: { type: 'integer' },
          maxAttempts: { type: 'integer' },
        },
      },
      Usage: {
        type: 'object',
        properties: {
          creditsPaisa: { type: 'integer' },
          calls: {
            type: 'object',
            properties: {
              last24h: { type: 'integer' },
              last7d: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/v1/agents': {
      get: {
        summary: 'List agents',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Agent' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create an agent',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AgentCreate' } },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/v1/agents/{id}': {
      get: {
        summary: 'Retrieve an agent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Agent' } },
            },
          },
          '404': {
            description: 'Not Found',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/api/v1/calls': {
      get: {
        summary: 'List recent calls',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 } },
          { name: 'outcome', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        summary: 'Originate an outbound call',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['agent_id', 'to_e164'],
                properties: {
                  agent_id: { type: 'string' },
                  to_e164: { type: 'string' },
                  from_e164: { type: 'string' },
                  metadata: { type: 'object', additionalProperties: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK' },
          '403': {
            description: 'Forbidden (DNC / insufficient credits)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/api/v1/calls/{id}': {
      get: {
        summary: 'Retrieve a call',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Call' } },
            },
          },
        },
      },
    },
    '/api/v1/numbers': {
      get: { summary: 'List phone numbers', responses: { '200': { description: 'OK' } } },
      post: {
        summary: 'Connect a phone number',
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/v1/contacts': {
      get: { summary: 'List contacts', responses: { '200': { description: 'OK' } } },
      post: {
        summary: 'Upsert a contact (by e164)',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/v1/campaigns': {
      get: { summary: 'List campaigns', responses: { '200': { description: 'OK' } } },
      post: {
        summary: 'Create a campaign (starts in draft)',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/v1/campaigns/{id}/start': {
      post: {
        summary: 'Transition a campaign to running',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/v1/campaigns/{id}/pause': {
      post: {
        summary: 'Transition a campaign to paused',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/api/v1/knowledge': {
      get: { summary: 'List knowledge bases', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create a knowledge base', responses: { '201': { description: 'Created' } } },
    },
    '/api/v1/dnc': {
      get: { summary: 'List DNC entries for the org', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Add a number to the DNC list', responses: { '201': { description: 'Created' } } },
    },
    '/api/v1/usage': {
      get: {
        summary: 'Current credit balance + call counters',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Usage' } },
            },
          },
        },
      },
    },
  },
}

export function GET(): Response {
  return NextResponse.json(spec, {
    headers: { 'cache-control': 'public, max-age=60' },
  })
}
