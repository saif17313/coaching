'use client';
import NextLink,{useLinkStatus} from 'next/link';
import {useEffect,useId,type ComponentProps} from 'react';
import {setNavigationPending} from './navigation-state.mjs';
function Pending(){const {pending}=useLinkStatus(),id=useId();useEffect(()=>{setNavigationPending(id,pending);return()=>setNavigationPending(id,false);},[id,pending]);return null;}
export default function ProgressLink({children,...props}:ComponentProps<typeof NextLink>){return <NextLink {...props}>{children}<Pending/></NextLink>;}
