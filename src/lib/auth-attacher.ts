// Attaches the cemis JWT to outgoing TanStack Start server-function RPCs.
import { createMiddleware } from '@tanstack/react-start';

export const attachCemisAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('cemis_token') : null;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  }
);
