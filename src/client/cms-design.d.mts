export type ImageDesign={width?:number;height?:number;mobileWidth?:number;scale?:number;aspect?:'auto'|'1/1'|'4/3'|'16/9'|'3/4';fit?:'cover'|'contain';focalX?:number;focalY?:number;horizontal?:'left'|'center'|'right';vertical?:'top'|'center'|'bottom';radius?:number};
export type CmsDesign={layout?:'full'|'contained';background?:'default'|'white'|'ivory'|'mint'|'navy';paddingTop?:number;paddingBottom?:number;minHeight?:number;align?:'left'|'center'|'right';headingScale?:number;textScale?:number;imageGap?:number;images?:Record<string,ImageDesign>};
export const DESIGN_SCHEMA:Record<string,unknown>;
export const IMAGE_DESIGN_SCHEMA:Record<string,unknown>;
export function validateCmsDesign(value:unknown):value is CmsDesign;
export const backgroundColors:Readonly<Record<string,string>>;
