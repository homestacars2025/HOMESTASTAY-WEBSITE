/** The Turnstile `action` for anything that sends an SMS — shared by the
 *  widget (client) and the verifier (server), so the two cannot drift. */
export const TURNSTILE_ACTION_PHONE = 'phone';

/** The Turnstile `action` for the public "List your property" form (/host). */
export const TURNSTILE_ACTION_HOST_LEAD = 'host_lead';
