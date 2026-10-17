import 'server-only';
import {createTeacherOverviewEndpoint} from './teacher-overview.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {countOverviewRows} from '../supabase/count';

export const teacherOverviewRoute=createTeacherOverviewEndpoint({verify:verifyActiveActor,countRows:countOverviewRows});
