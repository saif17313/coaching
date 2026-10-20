-- Private PDF learning materials. No direct client metadata DML, no public bucket,
-- no object overwrite/delete. Revoke RPC/Storage policies to disable without data loss.
create table public.learning_material_uploads(
 id uuid primary key,batch_id uuid not null references public.batches(id) on delete restrict,
 storage_key text not null unique,filename text not null,
 content_type text not null check(content_type='application/pdf'),
 size_bytes bigint not null check(size_bytes between 1 and 5242880),
 sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 check(char_length(filename) between 5 and 160 and filename !~ '[[:cntrl:]/\\]' and filename~*'\.pdf$')
);
create index learning_uploads_batch_idx on public.learning_material_uploads(batch_id);
alter table public.learning_material_uploads enable row level security;
revoke all on public.learning_material_uploads from public,anon,authenticated;
alter table public.batch_contents add constraint batch_contents_verified_upload_fk
 foreign key(upload_id) references public.learning_material_uploads(id) on delete restrict not valid;
do $$begin
 if not exists(select 1 from public.batch_contents) then
  alter table public.batch_contents validate constraint batch_contents_verified_upload_fk;
 end if;
end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('educentre-learning-materials','educentre-learning-materials',false,5242880,array['application/pdf']) on conflict(id) do nothing;
do $$begin
 if not exists(select 1 from storage.buckets where id='educentre-learning-materials' and not public
  and file_size_limit=5242880 and allowed_mime_types=array['application/pdf']) then raise exception 'MATERIAL_BUCKET_UNSAFE';end if;
end;$$;

create function public.coaching_learning_storage_readable(p_key text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and (
  (p.role='teacher' and (split_part(p_key,'/',1)=p.id::text or exists(
   select 1 from public.learning_material_uploads u join public.batch_contents c on c.upload_id=u.id where u.storage_key=p_key)))
  or (p.role='student' and exists(select 1 from public.learning_material_uploads u join public.batch_contents c on c.upload_id=u.id
   join public.batches b on b.id=c.batch_id and not b.is_archived join public.enrollments e on e.batch_id=c.batch_id
   where u.storage_key=p_key and c.status='published' and (c.release_at is null or c.release_at<=now()) and e.student_id=p.id and e.status='active'))));
$$;
revoke all on function public.coaching_learning_storage_readable(text) from public,anon,authenticated;
grant execute on function public.coaching_learning_storage_readable(text) to authenticated;
create policy learning_teacher_insert on storage.objects for insert to authenticated with check(
 bucket_id='educentre-learning-materials' and public.coaching_media_actor_is_active_teacher()
 and name~'^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' and split_part(name,'/',1)=(select auth.uid())::text);
create policy learning_authorized_select on storage.objects for select to authenticated using(
 bucket_id='educentre-learning-materials' and public.coaching_learning_storage_readable(name));

create function public.coaching_learning_upload_register(p_id uuid,p_batch_id uuid,p_filename text,p_size_bytes bigint,p_sha256 text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());path text;payload jsonb;result jsonb;prior record;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_id is null or p_batch_id is null or p_operation_id is null or p_filename is null or char_length(p_filename) not between 5 and 160
  or p_filename~'[[:cntrl:]/\\]' or p_filename!~*'\.pdf$' or p_size_bytes is null or p_size_bytes not between 1 and 5242880
  or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'INVALID_MATERIAL';end if;
 payload:=jsonb_build_object('id',p_id,'batchId',p_batch_id,'filename',p_filename,'size',p_size_bytes,'sha',p_sha256);
 perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=actor and operation_id=p_operation_id for update;
 if found then if prior.operation_type<>'learning.upload' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 perform 1 from public.batches where id=p_batch_id and not is_archived for share;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 path:=actor::text||'/'||p_batch_id::text||'/'||p_id::text||'.pdf';
 if not exists(select 1 from storage.objects where bucket_id='educentre-learning-materials' and name=path
  and metadata->>'mimetype'='application/pdf' and metadata->>'size'=p_size_bytes::text) then raise exception 'MATERIAL_STORAGE_NOT_VERIFIED';end if;
 insert into public.learning_material_uploads(id,batch_id,storage_key,filename,content_type,size_bytes,sha256,created_by)
 values(p_id,p_batch_id,path,p_filename,'application/pdf',p_size_bytes,p_sha256,actor);
 result:=jsonb_build_object('id',p_id,'filename',p_filename,'contentType','application/pdf','sizeBytes',p_size_bytes);
 insert into public.audit_logs(actor_id,action,entity_id,details) values(actor,'learning.upload',p_id,jsonb_build_object('batchId',p_batch_id));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(actor,p_operation_id,'learning.upload',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_learning_upload_register(uuid,uuid,text,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.coaching_learning_upload_register(uuid,uuid,text,bigint,text,uuid) to authenticated;

create function public.coaching_learning_material_write(p_action text,p_id uuid,p_batch_id uuid,p_upload_id uuid,p_title text,p_description text,p_release_at timestamptz,p_expected_updated_at timestamptz,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());payload jsonb;result jsonb;prior record;material public.batch_contents%rowtype;upload public.learning_material_uploads%rowtype;
begin
 if not public.coaching_media_actor_is_active_teacher() then raise exception 'FORBIDDEN';end if;
 if p_action is null or p_action not in ('draft.create','draft.update','publish','archive') or p_id is null or p_batch_id is null or p_operation_id is null then raise exception 'INVALID_MATERIAL';end if;
 if p_action in ('draft.create','draft.update') then
  if p_upload_id is null or p_title is null or char_length(trim(p_title)) not between 2 and 160 or p_title~'[[:cntrl:]]'
   or p_description is null or char_length(p_description)>2000 then raise exception 'INVALID_MATERIAL';end if;
 else if p_upload_id is not null or p_title is not null or p_description is not null or p_release_at is not null then raise exception 'INVALID_MATERIAL';end if;end if;
 payload:=jsonb_build_object('action',p_action,'id',p_id,'batchId',p_batch_id,'upload',p_upload_id,'title',p_title,'description',p_description,'release',p_release_at,'expected',p_expected_updated_at);
 perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(p_operation_id::text));
 select * into prior from public.coaching_mutation_receipts where actor_id=actor and operation_id=p_operation_id for update;
 if found then if prior.operation_type<>'learning.write' or prior.payload<>payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 perform 1 from public.batches where id=p_batch_id and not is_archived for share;
 if not found then raise exception 'BATCH_UNAVAILABLE';end if;
 if p_action='draft.create' then
  if p_expected_updated_at is not null then raise exception 'INVALID_MATERIAL';end if;
 else
  select * into material from public.batch_contents where id=p_id and batch_id=p_batch_id for update;
  if not found then raise exception 'MATERIAL_NOT_FOUND';end if;
  if p_expected_updated_at is null or material.updated_at<>p_expected_updated_at then raise exception 'REVISION_CONFLICT';end if;
  if material.status='archived' then raise exception 'ALREADY_ARCHIVED';end if;
  if p_action in ('draft.update','publish') and material.status<>'draft' then raise exception 'MATERIAL_NOT_DRAFT';end if;
 end if;
 if p_action in ('draft.create','draft.update','publish') then
  select * into upload from public.learning_material_uploads where id=coalesce(p_upload_id,material.upload_id) and batch_id=p_batch_id for share;
  if not found then raise exception 'MATERIAL_STORAGE_NOT_VERIFIED';end if;
  if p_upload_id is not null and (p_action='draft.create' or p_upload_id is distinct from material.upload_id) and upload.created_by<>actor then raise exception 'FORBIDDEN';end if;
  if not exists(select 1 from storage.objects where bucket_id='educentre-learning-materials' and name=upload.storage_key
   and metadata->>'mimetype'=upload.content_type and metadata->>'size'=upload.size_bytes::text) then raise exception 'MATERIAL_STORAGE_NOT_VERIFIED';end if;
 end if;
 if p_action='draft.create' then
  insert into public.batch_contents(id,batch_id,upload_id,title,description,release_at,created_by)
   values(p_id,p_batch_id,p_upload_id,trim(p_title),p_description,p_release_at,actor) returning * into material;
 elsif p_action='draft.update' then
  update public.batch_contents set upload_id=p_upload_id,title=trim(p_title),description=p_description,release_at=p_release_at,updated_at=clock_timestamp() where id=p_id returning * into material;
 else
  update public.batch_contents set status=case p_action when 'publish' then 'published' else 'archived' end,updated_at=clock_timestamp() where id=p_id returning * into material;
 end if;
 result:=jsonb_build_object('id',material.id,'batchId',material.batch_id,'status',material.status,'updatedAt',to_char(material.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 insert into public.audit_logs(actor_id,action,entity_id,details) values(actor,'learning.'||p_action,p_id,jsonb_build_object('batchId',p_batch_id));
 insert into public.coaching_mutation_receipts(actor_id,operation_id,operation_type,payload,result) values(actor,p_operation_id,'learning.write',payload,result);
 return result;
end;$$;
revoke all on function public.coaching_learning_material_write(text,uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.coaching_learning_material_write(text,uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid) to authenticated;

create function public.coaching_learning_material_download(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('id',c.id,'uploadId',u.id,'key',u.storage_key,'filename',u.filename,'contentType',u.content_type,'sizeBytes',u.size_bytes,'sha256',u.sha256) into result
 from public.batch_contents c join public.learning_material_uploads u on u.id=c.upload_id
 where c.id=p_id and c.status<>'archived' and public.coaching_learning_storage_readable(u.storage_key);
 return result;
end;$$;
revoke all on function public.coaching_learning_material_download(uuid) from public,anon,authenticated;
grant execute on function public.coaching_learning_material_download(uuid) to authenticated;
notify pgrst,'reload schema';
