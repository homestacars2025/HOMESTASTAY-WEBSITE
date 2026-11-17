/**
 * The self-serve "Become a host" path (/host → BecomeHostCta → become_host).
 * Client-safe constants shared by the page (server) and the button (client).
 */

/** Set by the tap, for an hour: only the browser that started the flow resumes it after sign-up. */
export const HOST_INTENT_COOKIE = 'hs_host_intent';

/** Where sign-up returns to, to finish the flow. */
export const HOST_START_PATH = '/host?start=1';
