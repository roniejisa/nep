import {storedCsvColumns} from '@/lib/product-import';
export default function ProductCsvDetails({metadata,columns}:{metadata?:Record<string,unknown>;columns?:Record<string,string>}){
 const values=columns||storedCsvColumns(metadata);
 if(!Object.keys(values).length)return null;
 return <div className="product-csv-details">
  {!columns&&typeof metadata?.file==='string'&&<p className="small-note">Nguồn: {metadata.file}{typeof metadata.row==='string'?` · dòng ${metadata.row}`:''}</p>}
  {!columns&&!metadata?.columns&&<p className="small-note">Dữ liệu từ bản nhập cũ. Nhập lại CSV để lưu đầy đủ mọi cột gốc.</p>}
  <dl>{Object.entries(values).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
 </div>;
}
