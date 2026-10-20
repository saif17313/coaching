import type {Metadata} from 'next';
import {AcceptStudentInvitation} from '@/components/portal/AcceptStudentInvitation';
import '../portal.css';
export const metadata:Metadata={title:'Accept Student invitation | EduCentre',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function AcceptInvite(){return <AcceptStudentInvitation/>;}
