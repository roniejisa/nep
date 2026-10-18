-- Upgrade after automation-unrestricted.sql and reels.sql. Safe to run again.
-- Preserves existing times, consent, targets, posts and jobs. Does not enable a schedule.
begin;
-- First installation starts at the current minute, without unexpectedly backfilling
-- old unclaimed slots. IF NOT EXISTS preserves this anchor on subsequent runs.
alter table public.affiliate_automation_settings
 add column if not exists dense_schedule_started_at timestamptz not null default now();
create or replace function public.valid_affiliate_schedule(v jsonb)
returns boolean language plpgsql immutable as $$
begin
 if v is null or jsonb_typeof(v)<>'array' then return false;end if;
 if jsonb_array_length(v)=0 then return false;end if;
 if exists(select 1 from jsonb_array_elements(v) t where jsonb_typeof(t)<>'string') then return false;end if;
 if exists(select 1 from jsonb_array_elements_text(v) t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false;end if;
 return (select count(distinct t) from jsonb_array_elements_text(v) t)=jsonb_array_length(v);
end;$$;
create or replace function public.due_affiliate_slot(p_owner uuid,p_at timestamptz default now())
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.affiliate_automation_settings;local_time timestamp:=p_at at time zone 'Asia/Ho_Chi_Minh';result timestamptz;period_value text;start_minute integer;
begin
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner;
 if not found or not cfg.enabled then return null;end if;
 if cfg.schedule_mode='times' then
  -- One-minute resolution, no arbitrary number-of-slots cap or 15-minute spacing rule.
  -- Earliest unclaimed due slot wins, including midnight rollover and delayed workers.
  select min(slots.due) into result from (
   select ((day_value::date+t::time) at time zone 'Asia/Ho_Chi_Minh') due
   from generate_series(local_time::date-1,local_time::date,interval '1 day') day_value
   cross join jsonb_array_elements_text(cfg.schedule_times) t
  ) slots
  where slots.due<=p_at and slots.due>p_at-interval '24 hours'
   and slots.due>=date_trunc('minute',cfg.updated_at)
   and slots.due>=date_trunc('minute',cfg.dense_schedule_started_at)
   and not exists(select 1 from public.affiliate_automation_jobs j where j.owner_id=p_owner and j.slot=slots.due);
  return result;
 end if;
 -- Preserve legacy window behavior for schedules not yet saved in times mode.
 period_value:=public.affiliate_posting_period(p_at,cfg.morning_start,cfg.morning_end,cfg.evening_start,cfg.evening_end);
 if period_value is null then return null;end if;
 start_minute:=round(case when period_value='morning' then cfg.morning_start*60 else cfg.evening_start*60 end);
 if mod(extract(hour from local_time)::integer*60+extract(minute from local_time)::integer-start_minute,60)<>0 then return null;end if;
 result:=date_trunc('hour',p_at);
 if exists(select 1 from public.affiliate_automation_jobs j where j.owner_id=p_owner and j.slot=result) then return null;end if;
 return result;
end;$$;
create or replace function public.claim_affiliate_automation(p_owner uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.affiliate_automation_settings;job uuid;due timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('affiliate_automation:'||p_owner::text,0));
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner for update;
 if not found or not cfg.enabled then return null;end if;
 if exists(select 1 from public.affiliate_automation_jobs where owner_id=p_owner and status='running' and created_at>now()-interval '10 minutes') then return null;end if;
 due:=public.due_affiliate_slot(p_owner);if due is null then return null;end if;
 insert into public.affiliate_automation_jobs(owner_id,slot) values(p_owner,due)
 on conflict(owner_id,slot) do nothing returning id into job;
 return job;
end;$$;
revoke all on function public.due_affiliate_slot(uuid,timestamptz),public.claim_affiliate_automation(uuid) from public,anon,authenticated;
grant execute on function public.due_affiliate_slot(uuid,timestamptz),public.claim_affiliate_automation(uuid) to service_role;
commit;
