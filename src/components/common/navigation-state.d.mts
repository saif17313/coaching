export function setNavigationPending(id:string,pending:boolean):void;
export function navigationSnapshot():boolean;
export function navigationServerSnapshot():boolean;
export function subscribeNavigation(listener:()=>void):()=>void;
