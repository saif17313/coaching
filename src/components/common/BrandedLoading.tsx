import {EduCentreLogo} from './EduCentreLogo';
import './brand.css';
/** Route-level loading state for genuine waits (streaming, slow navigations). Progress is unknown here, so the bar is indeterminate. */
export function BrandedLoading({label='Preparing your learning space'}:{label?:string}){return <div className="brand-loading" role="status" aria-live="polite"><EduCentreLogo className="brand-loading-logo"/><p>{label}</p><div className="brand-loading-track" aria-hidden="true"><i/></div></div>;}
