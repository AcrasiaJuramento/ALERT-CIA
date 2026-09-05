const listeners = new Set();
export const onDataInvalidated = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const notifyDataInvalidated = () => { for (const listener of listeners) listener(); };
