/**
 * Zod schemas for request validation.
 */
import { z } from 'zod';

export const authSchemas = {
  register: z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2).max(80),
  }),
  login: z.object({
    email: z.string().email('Invalid email format').min(1, 'Email is required'),
    password: z.string().min(1, 'Password is required'),
  }),
  refresh: z.object({
    refreshToken: z.string().min(1),
  }),
  logout: z.object({
    refreshToken: z.string().optional(),
  }),
};

export const profileSchemas = {
  // The onboarding popup sends the user's GNS3 environment capability
  // (version + which backends are usable) and an optional image map.
  // The PUT handler marks the profile as calibrated once saved.
  update: z.object({
    gns3Version: z.string().max(20).optional(),
    supportsIou: z.boolean().optional(),
    supportsQemu: z.boolean().optional(),
    supportsDocker: z.boolean().optional(),
    strictValidation: z.boolean().optional(),
    requireTemplateImageMap: z.boolean().optional(),
    imageMap: z.record(z.string(), z.string()).optional(),
  }),
  updatePlan: z.object({
    plan: z.enum(['free', 'plus', 'pro']),
  }),
};

export const paymentSchemas = {
  checkout: z.object({
    plan: z.enum(['plus', 'pro']),
  }),
  confirm: z.object({
    sessionId: z.string().min(1),
  }),
};

export const sessionSchemas = {
  create: z.object({}),
  updateTitle: z.object({
    title: z.string().trim().min(1).max(200),
  }),
  updateStarred: z.object({
    starred: z.boolean(),
  }),
};

export const messageSchemas = {
  create: z.object({
    content: z.string().min(1).max(5000),
  }),
};

export const exportSchemas = {
  create: z.object({
    securityProfile: z.enum(['none', 'basic', 'enterprise']).optional(),
  }),
};
