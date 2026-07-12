// Auth middleware — Supabase replaced by Spring Boot JWT.
// Server functions that need auth read the Bearer token via getRequest().
import { createMiddleware } from '@tanstack/react-start';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => next({ context: {} })
);
