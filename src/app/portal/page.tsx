import type {Metadata} from 'next';
import {PortalClient} from '@/components/portal/PortalClient';
import './portal.css';
export const metadata:Metadata={title:'Portal • EduCentre',robots:{index:false,follow:false}};
export default function PortalPage(){return <PortalClient/>;}
