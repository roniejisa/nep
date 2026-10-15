export function postImages(input:unknown,fallback:unknown=null):string[]{
 const values=input===undefined?(fallback?[fallback]:[]):input;
 if(!Array.isArray(values)||values.length>10||values.some(v=>typeof v!=='string'||! /^[0-9a-f-]{36}$/i.test(v))||new Set(values).size!==values.length)throw new Error('Chọn tối đa 10 ảnh hợp lệ, không trùng.');
 return values;
}
