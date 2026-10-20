export interface WebsiteShortcut {id:string;schemaKey?:string|null;label:string;slug:string|null;kind:string|null;match:string|null;parity:"full"|"partial";tab:"content"|"media"|"settings";}
export interface WebsiteGroup {title:string;items:WebsiteShortcut[];}
export const WEBSITE_MENU:ReadonlyArray<WebsiteGroup>;
export function getWebsiteTarget(id:string):WebsiteShortcut|null;
