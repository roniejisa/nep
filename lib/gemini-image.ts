import sharp from 'sharp';
export const IMAGE_MODEL='gemini-3.1-flash-lite-image';
export async function generateProductImage(options:{key:string;model?:string;prompt:string;reference:Buffer;transport?:typeof fetch}){
 const model=options.model||IMAGE_MODEL;if(!/^[A-Za-z0-9._-]{1,100}$/.test(model)||!model.includes('image'))throw new Error('Chọn model tạo ảnh, không dùng model viết bài.');
 const reference=options.reference;if(reference.length>2097152||reference.toString('ascii',0,4)!=='RIFF'||reference.toString('ascii',8,12)!=='WEBP')throw new Error('Ảnh tham chiếu phải là WebP và tối đa 2 MB.');
 const transport=options.transport??fetch;
 let response:Response;try{response=await transport(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':options.key},body:JSON.stringify({contents:[{role:'user',parts:[{text:options.prompt},{inlineData:{mimeType:'image/webp',data:reference.toString('base64')}}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}}}),signal:AbortSignal.timeout(60000),redirect:'error'});}catch{throw new Error('Tạo ảnh hết thời gian chờ hoặc lỗi mạng. Không tự thử lại để tránh phát sinh phí lặp.');}
 if(!response.ok)throw new Error(`Google tạo ảnh trả HTTP ${response.status}. Kiểm tra quyền model, API key, billing và quota; không tự chuyển model.`);
 const result=await response.json();const candidate=result.candidates?.[0];if(candidate?.finishReason!=='STOP')throw new Error('Google chưa hoàn tất ảnh hoặc đã chặn yêu cầu.');
 const part=candidate.content?.parts?.find((p:{thought?:boolean;inlineData?:{data?:string;mimeType?:string}})=>!p.thought&&p.inlineData?.data)?.inlineData;
 if(!part||typeof part.data!=='string'||!['image/png','image/jpeg','image/webp'].includes(part.mimeType)||part.data.length>16*1024*1024)throw new Error('Google không trả ảnh hợp lệ hoặc ảnh quá lớn.');
 const input=Buffer.from(part.data,'base64');if(!input.length)throw new Error('Ảnh trả về rỗng.');
 let data:Buffer|undefined,info:{width:number;height:number}|undefined;
 for(const quality of [84,76,68]){const result=await sharp(input,{limitInputPixels:60000000}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality}).toBuffer({resolveWithObject:true});data=result.data;info=result.info;if(data.length<=2097152)break;}
 if(!data||!info||data.length>2097152)throw new Error('Không nén được ảnh WebP về dưới 2 MB.');
 const tokens=result.usageMetadata?.totalTokenCount;
 return {data,width:info.width,height:info.height,originalBytes:input.length,tokens:typeof tokens==='number'?tokens:null,model};
}
