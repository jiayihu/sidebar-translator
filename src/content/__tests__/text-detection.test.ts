import { beforeEach, describe, expect, it } from 'vitest';
import { detectTextBlocks } from '../text-detection';
import babbelHtml from './fixtures/babbel-dialogue.html?raw';
import datepickerHtml from './fixtures/datepicker.html?raw';

beforeEach(() => {
  document.body.innerHTML = '';
});

function detect(html: string) {
  document.body.innerHTML = html;
  return detectTextBlocks(document.body).map(({ text, section }) => ({ text, section }));
}

describe('text detection', () => {
  it('datepicker calendar: should detect day names but not digit-only cells', () => {
    const blocks = detect(datepickerHtml);
    expect(blocks).toMatchSnapshot();
  });

  it('babbel dialogue: should split dialogue turns instead of merging them into one main block', () => {
    const blocks = detect(babbelHtml);
    expect(blocks).toMatchSnapshot();
  });
});
