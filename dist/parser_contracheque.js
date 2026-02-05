const MONTH_MAP = {
  JANEIRO: '01',
  JAN: '01',
  FEVEREIRO: '02',
  FEV: '02',
  MARCO: '03',
  MARÇO: '03',
  MAR: '03',
  ABRIL: '04',
  ABR: '04',
  MAIO: '05',
  MAI: '05',
  JUNHO: '06',
  JUN: '06',
  JULHO: '07',
  JUL: '07',
  AGOSTO: '08',
  AGO: '08',
  SETEMBRO: '09',
  SET: '09',
  OUTUBRO: '10',
  OUT: '10',
  NOVEMBRO: '11',
  NOV: '11',
  DEZEMBRO: '12',
  DEZ: '12'
};

const CODE_CLASSIFICATION = {
  6000: 'NORMAL',
  6100: 'NORMAL',
  6019: 'NORMAL',
  6060: 'EXTRA',
  6160: 'EXTRA',
  6061: 'EXTRA',
  6600: 'PECULIO',
  6602: 'PECULIO',
  6619: 'PECULIO'
};

const parseBrazilianNumber = (value) => {
  if (!value) return 0;
  const normalized = value.toString().replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeText = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const parseCompetenciaFromText = (text) => {
  if (!text) return null;
  const normalized = normalizeText(text);
  const monthYearMatch = normalized.match(/\b(0?[1-9]|1[0-2])\/(20\d{2}|19\d{2})\b/);
  if (monthYearMatch) {
    const month = String(monthYearMatch[1]).padStart(2, '0');
    const year = monthYearMatch[2];
    return `${year}-${month}`;
  }
  const monthShortMatch = normalized.match(/\b(0?[1-9]|1[0-2])\/(\d{2})\b/);
  if (monthShortMatch) {
    const month = String(monthShortMatch[1]).padStart(2, '0');
    const yearSuffix = Number(monthShortMatch[2]);
    const year = yearSuffix >= 80 ? 1900 + yearSuffix : 2000 + yearSuffix;
    return `${year}-${month}`;
  }
  const monthNameMatch = normalized.match(
    /\b(JANEIRO|FEVEREIRO|MARCO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO|JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/
  );
  const yearMatch = normalized.match(/\b(20\d{2}|19\d{2})\b/);
  if (monthNameMatch && yearMatch) {
    const month = MONTH_MAP[monthNameMatch[1]];
    const year = yearMatch[1];
    if (month) return `${year}-${month}`;
  }
  return null;
};

const classifyCode = (code) => CODE_CLASSIFICATION[Number(code)] || null;

const parseContrachequeText = (text) => {
  const competencia = parseCompetenciaFromText(text);
  const items = [];
  const warnings = [];
  const lines = text.split('\n').map((line) => line.trim());
  const regex =
    /(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/;

  lines.forEach((line) => {
    const match = line.match(regex);
    if (!match) return;
    const codigo = match[3];
    const descricao = match[4].trim();
    const valor = parseBrazilianNumber(match[5]);
    const tipo = classifyCode(codigo);
    if (!tipo) return;
    items.push({
      codigo,
      descricao,
      valor,
      tipo
    });
  });

  if (!items.length) {
    warnings.push('Nenhuma rubrica contributiva encontrada no contracheque.');
  }

  return { competencia, itens: items, warnings };
};

export { CODE_CLASSIFICATION, classifyCode, parseBrazilianNumber, parseCompetenciaFromText, parseContrachequeText };
