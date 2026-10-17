export type AccessSession={access_token:string;user:{id:string}};
export type AccessSnapshot={view:'checking'|'login'|'allowed'|'unavailable';warning:string;error:string;refreshing:boolean};
type Dependencies={getSession:()=>Promise<AccessSession|null>;refreshSession:()=>Promise<AccessSession|null>;check:(session:AccessSession,signal:AbortSignal)=>Promise<{status:number;userId?:string}>;onChange:(state:AccessSnapshot)=>void;now?:()=>number};
export const ACCESS_CACHE_MS=30000,ACCESS_GRACE_MS=300000;
const offline='Chưa kiểm tra lại được quyền quản trị do mất kết nối hoặc máy chủ tạm lỗi. Hệ thống sẽ thử lại; các thao tác vẫn được kiểm tra quyền trên máy chủ.';
export function createAccessController(deps:Dependencies){
 const now=deps.now||Date.now;
 let state:AccessSnapshot={view:'checking',warning:'',error:'',refreshing:false},active=true,revision=0,confirmedUser='',lastVerified=0,lastToken='',lastRefreshAttempt=-Infinity;
 let inFlight:{token:string;user:string;promise:Promise<void>;controller:AbortController}|undefined,reading:Promise<void>|undefined;
 function emit(patch:Partial<AccessSnapshot>){if(!active)return;state={...state,...patch};deps.onChange(state);}
 function reset(){revision++;inFlight?.controller.abort();inFlight=undefined;confirmedUser='';lastVerified=0;lastToken='';}
 function transient(){if(!active)return;
  if(confirmedUser&&now()-lastVerified<ACCESS_GRACE_MS)emit({view:'allowed',warning:offline,error:'',refreshing:false});
  else emit({view:'unavailable',warning:'',error:'Chưa xác nhận được quyền quản trị. Kiểm tra kết nối rồi bấm Thử lại; bạn chưa bị đăng xuất.',refreshing:false});
 }
 function tick(){if(state.warning&&now()-lastVerified>=ACCESS_GRACE_MS)transient();}
 function sessionChanged(session:AccessSession|null,force=false,refreshed=false):Promise<void>{
  if(!active)return Promise.resolve();
  if(!session){reset();emit({view:'login',warning:'',error:'',refreshing:false});return Promise.resolve();}
  const user=session.user.id,token=session.access_token;
  if(confirmedUser&&confirmedUser!==user){reset();emit({view:'checking',warning:'',error:'',refreshing:false});}
  if(inFlight?.user===user&&inFlight.token===token)return inFlight.promise;
  if(!force&&confirmedUser===user&&lastToken===token&&now()-lastVerified<ACCESS_CACHE_MS)return Promise.resolve();
  const current=++revision;inFlight?.controller.abort();
  const controller=new AbortController();
  if(confirmedUser!==user)emit({view:'checking',warning:'',error:'',refreshing:true});else emit({refreshing:true});
  const promise=Promise.resolve().then(async()=>{
   const timeout=setTimeout(()=>controller.abort(),10000);
   try{
    const response=await deps.check(session,controller.signal);
    if(!active||current!==revision)return;
    if(response.status===401&&!refreshed&&now()-lastRefreshAttempt>=ACCESS_CACHE_MS){
     lastRefreshAttempt=now();
     const renewed=await deps.refreshSession();if(!active||current!==revision)return;
     if(renewed&&renewed.user.id===user&&renewed.access_token!==token){inFlight=undefined;await sessionChanged(renewed,true,true);return;}
     reset();emit({view:'login',warning:'',error:'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',refreshing:false});return;
    }
    if(response.status===401||response.status===403){reset();emit({view:'login',warning:'',error:response.status===403?'Tài khoản này không có quyền quản trị.':'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',refreshing:false});return;}
    if(response.status!==200)throw new Error('temporarily unavailable');
    if(response.userId!==user){reset();emit({view:'login',warning:'',error:'Không thể xác nhận đúng tài khoản quản trị.',refreshing:false});return;}
    confirmedUser=user;lastVerified=now();lastToken=token;lastRefreshAttempt=-Infinity;emit({view:'allowed',warning:'',error:'',refreshing:false});
   }catch{if(active&&current===revision)transient();}
   finally{clearTimeout(timeout);if(inFlight?.controller===controller)inFlight=undefined;}
  });
  inFlight={user,token,promise,controller};return promise;
 }
 function refresh(force=false){
  if(!active)return Promise.resolve();if(reading)return reading;
  const before=revision;
  reading=Promise.resolve().then(async()=>{try{const session=await deps.getSession();if(active&&before===revision)await sessionChanged(session,force);}catch{if(active&&before===revision)transient();}}).finally(()=>{reading=undefined;});
  return reading;
 }
 return {sessionChanged,refresh,tick,snapshot:()=>state,stop:()=>{active=false;reset();}};
}
