import {createHmac,timingSafeEqual} from 'node:crypto';
function mac(value:string,secret:string){return createHmac('sha256',secret).update('nep-social-image-v1:'+value).digest('base64url');}
export function signImage(imageId:string,secret:string,now=Date.now()){
 if(!/^[a-f0-9-]{36}$/i.test(imageId))throw new Error('ID ảnh không hợp lệ.');
 const value=Buffer.from(JSON.stringify({imageId,expires:Math.floor(now/1000)+3600})).toString('base64url');return value+'.'+mac(value,secret);
}
export function verifyImage(token:string,secret:string,now=Date.now()):string{
 const [value,signature,...extra]=token.split('.');if(extra.length||!value||!signature||token.length>500)throw new Error('Link ảnh không hợp lệ.');
 const expected=Buffer.from(mac(value,secret)),actual=Buffer.from(signature);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Chữ ký ảnh không hợp lệ.');
 const parsed=JSON.parse(Buffer.from(value,'base64url').toString());const current=Math.floor(now/1000);
 if(typeof parsed.expires!=='number'||parsed.expires<=current||parsed.expires>current+3600||!/^[a-f0-9-]{36}$/i.test(parsed.imageId))throw new Error('Link ảnh hết hạn.');return parsed.imageId;
}
