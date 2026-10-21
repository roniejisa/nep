type FailureDetail={kind:string;stage:string;http_status?:number|null;error_code?:number|null;error_subcode?:number|null};
const labels:Record<string,string>={token:'Token cần kết nối lại',permission:'Thiếu quyền',rate_limit:'Hết hạn mức',network:'Lỗi kết nối',meta:'Meta từ chối',ai:'Lỗi AI',database:'Lỗi dữ liệu',configuration:'Lỗi cấu hình',unknown:'Cần xác minh'};
// Keep only safe classification/codes in the 48h job summary; detailed errors still expire at 8h.
export function automationFailureContext(detail:FailureDetail,channel:string|null){
 const stage=['database','configuration','ai','connection','token_check','publish','recovery'].includes(detail.stage)?detail.stage:'unknown';
 const code=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0?String(value):'';
 const parts=[labels[detail.kind]||labels.unknown,`bước ${stage}`,['facebook','instagram','threads'].includes(channel||'')?channel:'',code(detail.http_status)?`HTTP ${code(detail.http_status)}`:'',code(detail.error_code)?`mã ${code(detail.error_code)}`:'',code(detail.error_subcode)?`mã phụ ${code(detail.error_subcode)}`:''].filter(Boolean);
 return parts.join(' · ');
}
export function automationFailureSummary(detail:FailureDetail,channel:string|null,recorded:boolean){
 const stage=detail.stage;
 return `Đã bỏ qua lượt lỗi · ${automationFailureContext(detail,channel)}. Lịch không bị tự tắt; mốc tiếp theo vẫn được xử lý.${stage==='publish'||stage==='recovery'?' Bài đã gửi nhưng chưa rõ kết quả giữ ở Cần xác minh; không tự gửi lại bài cũ.':''}${recorded?' Xem chi tiết trong Nhật ký lỗi (8 giờ).':' Chưa lưu được chi tiết lỗi; kiểm tra kết nối dữ liệu và log Vercel.'}`;
}
