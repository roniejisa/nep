import sharp from 'sharp';
export async function socialJpeg(input:Buffer){
 if(input.length>2*1024*1024||input.toString('ascii',0,4)!=='RIFF'||input.toString('ascii',8,12)!=='WEBP')throw new Error('Ảnh nguồn không phải WebP hợp lệ hoặc quá lớn.');
 return sharp(input,{limitInputPixels:60000000}).rotate().resize(1080,1080,{fit:'contain',background:'#ffffff'}).jpeg({quality:88,mozjpeg:true}).toBuffer();
}
