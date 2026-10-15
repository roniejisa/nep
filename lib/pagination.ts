export function pageWindow(total:number,page:number,pageSize:number){
 const size=Math.max(1,Math.min(100,Math.floor(pageSize)||12)),pages=Math.max(1,Math.ceil(Math.max(0,total)/size)),current=Math.max(1,Math.min(pages,Math.floor(page)||1));
 return {page:current,pageSize:size,pages,start:(current-1)*size,end:Math.min(current*size,total),total};
}
export function paginate<T>(items:T[],page:number,size:number){const window=pageWindow(items.length,page,size);return {...window,items:items.slice(window.start,window.end)};}
export function requestPage(value:string|null){const page=Number(value||1);return Number.isSafeInteger(page)&&page>0?Math.min(page,10000):1;}
