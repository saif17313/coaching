'use client';
import {createContext,useContext,type CSSProperties,type ReactNode} from 'react';
import {backgroundColors,validateCmsDesign,type CmsDesign} from '@/client/cms-design.mjs';
import './cms-design.css';
const Context=createContext<CmsDesign>({});
export const useCmsDesign=()=>useContext(Context);
export function CmsDesignScope({design,sectionId,children}:{design?:CmsDesign;sectionId?:string;children:ReactNode}){const parent=useCmsDesign(),safe=validateCmsDesign(design)?design:{},merged={...parent,...safe,images:{...parent.images,...safe.images}};const style:CSSProperties&Record<string,string|number|undefined>={background:safe.background?backgroundColors[safe.background]:undefined,paddingTop:safe.paddingTop,paddingBottom:safe.paddingBottom,minHeight:safe.minHeight,textAlign:safe.align,'--cms-heading-scale':(safe.headingScale??100)/100,'--cms-text-scale':(safe.textScale??100)/100,'--cms-image-gap':safe.imageGap===undefined?undefined:safe.imageGap+'px'};return <Context.Provider value={merged}><div className="cms-presentation-section" data-cms-section={sectionId} data-layout={safe.layout} data-background={safe.background} data-heading-scale={safe.headingScale===undefined?undefined:'custom'} data-text-scale={safe.textScale===undefined?undefined:'custom'} style={style}>{children}</div></Context.Provider>;}
