export const DISCLOSURE = 'Link affiliate: mình có thể nhận hoa hồng khi bạn mua qua link.';
export type Channel = 'facebook' | 'threads';
export function composePost(text: string, link: string) {
  const url = new URL(link);
  if (url.protocol !== 'https:') throw new Error('Link affiliate phải dùng HTTPS.');
  return `${text.trim()}\n\n${DISCLOSURE}\n${link}`;
}
export function validatePost(channel: Channel, text: string) {
  if (!text.trim()) throw new Error('Nội dung đang trống.');
  const limit = channel === 'threads' ? 500 : 5000;
  if (Array.from(text).length > limit) throw new Error(`Bài ${channel} vượt ${limit} ký tự (tính cả link và thông báo affiliate).`);
}
