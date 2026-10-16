export type CoreView='products'|'images'|'content'|'setup';
export const adminPaths={products:'/san-pham/',images:'/thu-vien/',content:'/noi-dung/',setup:'/cai-dat/',automation:'/automation/',categories:'/categories/'} as const;
export type AdminView=keyof typeof adminPaths;
export const adminLabels={products:'Sản phẩm',images:'Thư viện ảnh',content:'Nội dung AI',setup:'Thiết lập',automation:'Lịch tự đăng',categories:'Danh mục'};
export function adminView(pathname:string):AdminView{const clean=pathname.replace(/\/+$/,'')||'/';return (Object.entries(adminPaths).find(([,path])=>path.replace(/\/+$/,'')===clean)?.[0]||'products') as AdminView;}
