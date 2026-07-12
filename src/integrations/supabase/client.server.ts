// Server-side admin client — now routes to the Spring Boot backend like the browser client.
// Previous Supabase service-role usage has been replaced by direct REST calls in server functions.
export { supabase as supabaseAdmin } from './client';
