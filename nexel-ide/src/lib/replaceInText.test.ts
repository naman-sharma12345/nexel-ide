import { describe, it, expect } from 'vitest';
import { replaceInText } from './replaceInText';
describe('replaceInText', () => {
  it('literal with $ kept', () => { expect(replaceInText('a.b a.b', 'a.b', '$1')).toEqual({ text: '$1 $1', count: 2 }); });
  it('regex groups', () => { expect(replaceInText('x1 y2', '([a-z])(\\d)', '$2$1', { regex: true })).toEqual({ text: '1x 2y', count: 2 }); });
  it('invalid regex no-op', () => { expect(replaceInText('abc', '(', 'z', { regex: true }).count).toBe(0); });
  it('whole word', () => { expect(replaceInText('cat concat', 'cat', 'dog', { wholeWord: true }).text).toBe('dog concat'); });
});
