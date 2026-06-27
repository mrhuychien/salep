// Context bridge render server-side ở www/dp.html → SPA đọc global này.
export const ctx = window.DP_CONTEXT || {};

export const isManager = () => !!ctx.isManager;
export const isStaff = () => !!ctx.isStaff;
export const hasProfile = () => !!ctx.hasProfile;
