import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operationError, readableError } from '../lib/errors.ts';
test('Storage RLS errors retain the failing step, code and original message', () => {
  const error = operationError('Đã lưu sản phẩm; tải ảnh WebP lên Storage', { statusCode: 403, message: 'new row violates row-level security policy' });
  const output = readableError(error);
  assert.match(output, /Storage · 403/);
  assert.match(output, /new row violates row-level security policy/);
});
test('Table privilege errors are distinguished from row-level policy failures', () => {
  const output = readableError(operationError('Cập nhật bảng affiliate_products', { code: '42501', message: 'permission denied for table affiliate_products' }));
  assert.match(output, /thiếu quyền thao tác trên bảng/);
  assert.match(output, /42501/);
  assert.match(output, /permission denied for table affiliate_products/);
});
test('Original database errors survive formatting instead of a generic RLS message', () => {
  assert.match(readableError({ code: '42501', message: 'permission denied for schema public' }), /thiếu quyền truy cập schema/);
  assert.match(readableError({ code: 'PGRST205', message: 'Missing table' }), /Missing table/);
  assert.match(readableError(new Error('Phiên đăng nhập không còn hợp lệ.')), /Phiên đăng nhập/);
});
