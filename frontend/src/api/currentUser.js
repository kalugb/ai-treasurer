// The signed-in user's key. shortcut: no login yet, so it is the temp pre-auth user from frontend/.env (default "1");
// when auth lands, read it from the session here and nowhere else.
export const CURRENT_USER_ID = import.meta.env.VITE_TEMP_USER_ID ?? '1'
