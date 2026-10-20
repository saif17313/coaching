import type {SitePage,SiteSection} from '../server/website/public-site';
export type HomeSectionDefinition={key:string;label:string;kind:string;source:string;fields:string[];selection?:string;catalog?:string};
export type HomeSectionMapping=HomeSectionDefinition&{section:SiteSection|null|undefined;sourceSlug:string;selectionSection:SiteSection|null|undefined;catalogSection:SiteSection|null|undefined;catalogSlug:string|null;available:boolean;mode:string};
export const HOME_SECTIONS:ReadonlyArray<HomeSectionDefinition>;
export function resolveHomeSection(key:string,home:SitePage|null,related?:Record<string,SitePage|null>):HomeSectionMapping|null;
export function homeSectionMap(home:SitePage|null,related?:Record<string,SitePage|null>):HomeSectionMapping[];
