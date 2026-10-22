const active=new Set(),listeners=new Set();
export function setNavigationPending(id,pending){if(pending)active.add(id);else active.delete(id);for(const listener of listeners)listener();}
export const navigationSnapshot=()=>active.size>0;
export const navigationServerSnapshot=()=>false;
export function subscribeNavigation(listener){listeners.add(listener);return()=>listeners.delete(listener);}
