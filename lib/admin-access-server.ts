// A connection/configuration failure is not evidence that a signed-in user was denied.
export function authFailureStatus(error:{status?:number;name?:string}|null|undefined){
 const status=error?.status;
 if(!status||status===429||status>=500||error?.name==='AuthRetryableFetchError')return 503;
 return 401;
}
