'use client';
import Image,{type ImageProps} from 'next/image';
import {createContext,useContext,type ReactNode} from 'react';
const PreviewMedia=createContext(false);
export function DraftMediaScope({children}:{children:ReactNode}){return <PreviewMedia.Provider value>{children}</PreviewMedia.Provider>;}
export default function SiteImage({src,alt,...props}:ImageProps){const preview=useContext(PreviewMedia);const match=typeof src==='string'?/^\/api\/v1\/public\/media\/([0-9a-f-]{36})$/.exec(src):null;return <Image {...props} alt={alt} src={preview&&match?`/api/v1/teacher/website/media/${match[1]}/preview`:src}/>;}
