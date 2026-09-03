import { describe, it, expect } from 'vitest';
import { split, splitSentences } from '../engine/splitEngine';

describe('splitSentences', () => {
  it('按句号切分并保留标点', () => {
    expect(splitSentences('你好。世界！')).toEqual(['你好。', '世界！']);
  });
  it('换行视为断句', () => {
    expect(splitSentences('第一行\n第二行')).toEqual(['第一行', '第二行']);
  });
  it('无标点整段返回', () => {
    expect(splitSentences('没有标点的一段话')).toEqual(['没有标点的一段话']);
  });
  it('空字符串返回空数组', () => {
    expect(splitSentences('')).toEqual([]);
  });
});

describe('split', () => {
  it('空文案返回 N 个空串（T3）', () => {
    expect(split('   ', 3)).toEqual(['', '', '']);
  });
  it('句数充足：顺序分桶', () => {
    expect(split('一。二。三。四。', 2)).toEqual(['一。二。', '三。四。']);
  });
  it('句数有余量：每段至少一句，末段不为空', () => {
    expect(split('一。二。三。四。', 3)).toEqual(['一。二。', '三。', '四。']);
  });
  it('句数不足：按字符均分', () => {
    expect(split('晚安', 2)).toEqual(['晚', '安']);
  });
  it('N 小于 1 按 1 处理', () => {
    expect(split('你好。', 0)).toEqual(['你好。']);
  });
});
