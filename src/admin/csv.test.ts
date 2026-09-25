import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM, quotes every field and ends lines with CRLF', () => {
    expect(toCsv(['Code', 'Packs'], [['SN-7KQ4M', 2]])).toBe('﻿"Code","Packs"\r\n"SN-7KQ4M","2"\r\n');
  });

  it('doubles quotes and keeps commas and newlines inside one field', () => {
    const csv = toCsv(['Note'], [['Ring the "back" bell,\r\nthen wait']]);
    expect(csv).toBe('﻿"Note"\r\n"Ring the ""back"" bell,\r\nthen wait"\r\n');
  });

  it('keeps Marathi and Hindi text as is', () => {
    expect(toCsv(['Name'], [['प्रांजली']])).toBe('﻿"Name"\r\n"प्रांजली"\r\n');
  });

  it('guards text that a spreadsheet would run as a formula', () => {
    const risky = ['=HYPERLINK("x")', '+91 98231', '-2+3', '@SUM(A1)', '\tTab', '\rCR'];
    const lines = toCsv(['x'], risky.map((v) => [v])).split('\r\n').slice(1, -1);
    expect(lines).toEqual(['"\'=HYPERLINK(""x"")"', '"\'+91 98231"', '"\'-2+3"', '"\'@SUM(A1)"', '"\'\tTab"', '"\'\rCR"']);
  });

  it('leaves numbers, safe text and empty cells alone', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [[-5, 'Neha = Pune', null, false]])).toBe(
      '﻿"a","b","c","d"\r\n"-5","Neha = Pune","","false"\r\n',
    );
  });
});
