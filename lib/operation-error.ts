export type ErrorKind='token'|'permission'|'rate_limit'|'network'|'meta'|'ai'|'database'|'configuration'|'unknown';
export class OperationError extends Error {
 kind:ErrorKind;httpStatus:number|null;code:number|null;subcode:number|null;
 constructor(message:string,kind:ErrorKind,httpStatus:number|null=null,code:number|null=null,subcode:number|null=null){super(message);this.name='OperationError';this.kind=kind;this.httpStatus=httpStatus;this.code=code;this.subcode=subcode;}
}
export function explainError(error:unknown,stage:string){
 let cursor:unknown=error;let structured:OperationError|undefined;
 for(let i=0;i<5&&cursor instanceof Error;i++){if(cursor instanceof OperationError){structured=cursor;break;}cursor=cursor.cause;}
 const raw=error instanceof Error?error.message:'Lỗi chưa xác định.';
 // Only our application errors reach here; still redact credentials/URLs before persistence.
 const message=raw.replace(/https?:\/\/\S+/gi,'[URL đã ẩn]').replace(/\b(?:Bearer\s+)?(?:EAA[A-Za-z0-9_-]{15,}|sb_[A-Za-z0-9_-]{15,})/g,'[khóa đã ẩn]').replace(/(access_token|api_key|secret|authorization)\s*[=:]\s*[^\s,;]+/gi,'$1=[đã ẩn]').slice(0,800);
 const kind:ErrorKind=structured?.kind||(stage==='token_check'||stage==='connection'||stage==='configuration'?'configuration':stage==='ai'?'ai':stage==='database'?'database':'unknown');
 const advice:Record<ErrorKind,string>={token:'Vào Thiết lập, kết nối lại hoặc gia hạn đúng tài khoản. Không đăng lại bài chưa rõ kết quả.',permission:'Cấp lại quyền đăng và kiểm tra quyền quản lý tài khoản đích.',rate_limit:'Kiểm tra hạn mức nền tảng, đợi hạn mức phục hồi; lượt lỗi được bỏ qua, lịch không tự tắt.',network:'Kiểm tra trạng thái nhà cung cấp và bài trên Meta trước khi thử lại.',meta:'Kiểm tra mã lỗi, ảnh, dữ liệu và quyền trong Meta.',ai:'Kiểm tra API key, model, quota và độ dài bài.',database:'Kiểm tra migration, kết nối Supabase và quyền server.',configuration:'Kiểm tra kết nối, biến môi trường và tài khoản đích trong Thiết lập.',unknown:'Đối chiếu lịch sử nội dung và Meta; không tự gửi lại bài chưa rõ kết quả.'};
 return {kind,stage,message,http_status:structured?.httpStatus??null,error_code:structured?.code??null,error_subcode:structured?.subcode??null,advice:structured&&'advice' in structured&&typeof structured.advice==='string'?structured.advice:advice[kind]};
}
