// Context bridge render server-side ở www/dp.html → SPA đọc global này.
export const ctx = window.DP_CONTEXT || {};

export const isManager = () => !!ctx.isManager;
export const isStaff = () => !!ctx.isStaff;
export const isNpp = () => !!ctx.isNpp;
export const hasProfile = () => !!ctx.hasProfile;
// Chủ NPP (User.custom_customer / Portal User) → tab Quản lý NPP (doc/08 §8).
export const isNppOwner = () => !!ctx.isNppOwner;
