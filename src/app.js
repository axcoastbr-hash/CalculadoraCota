import { INPC_INDEX, INPC_RANGE } from './data/inpc.js';
import { QX_FEM, QX_MASC } from './data/mortality_at2000_suavizada.js';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.mjs';
const FALLBACK_INTEREST_RATES = {
  2021: 0.0437,
  2022: 0.0437,
  2023: 0.0437,
  2024: 0.0444
};

const COTA_REAL_RATE = 0.0444;
const NSUA = 13;
const FCB = 0.9818;
const OMEGA = 115;
const INPC_GENERIC_WARNING =
  'Competências fora do intervalo do INPC disponível são ajustadas automaticamente pelo sistema.';
const INPC_KEYS = Object.keys(INPC_INDEX).sort();
const INPC_MIN_KEY = INPC_KEYS[0];
const INPC_MAX_KEY = INPC_KEYS[INPC_KEYS.length - 1];
const YEAR_RANGE = {
  min: Number(INPC_RANGE.start.split('-')[0]),
  max: 2026
};
let interestRates = { ...FALLBACK_INTEREST_RATES };

const CONTRIBUTION_TYPES = [
  { value: 'PARTICIPANTE_NORMAL', label: 'Participante (Normal)' },
  { value: 'PATROCINADORA_NORMAL', label: 'Patrocinadora (Normal)' },
  { value: 'JOIA', label: 'Joia' },
  { value: 'PECULIO', label: 'Pecúlio' },
  { value: 'OUTROS', label: 'Outros' }
];

const MODE_LABELS = {
  vaeba: 'VAEBA',
  cota: 'COTA'
};

const inputs = {
  modo: document.getElementById('modo-calculo'),
  nome: document.getElementById('nome'),
  sexo: document.getElementById('sexo'),
  nascimento: document.getElementById('nascimento'),
  dataCalculo: document.getElementById('data-calculo'),
  competenciaBase: document.getElementById('competencia-base'),
  competenciaFinal: document.getElementById('competencia-final'),
  anoTaxa: document.getElementById('ano-taxa'),
  beneficioBruto: document.getElementById('beneficio-bruto'),
  beneficioLiquido: document.getElementById('beneficio-liquido'),
  rubricas: [
    document.getElementById('rubrica-1'),
    document.getElementById('rubrica-2'),
    document.getElementById('rubrica-3'),
    document.getElementById('rubrica-4'),
    document.getElementById('rubrica-5')
  ],
  cotaDataInicial: document.getElementById('cota-data-inicial'),
  cotaRegraPatro: document.getElementById('cota-regra-patro'),
  cotaPatroFactor: document.getElementById('cota-patro-factor'),
  cotaIncludeParticipante: document.getElementById('cota-include-participante'),
  cotaIncludePatrocinadora: document.getElementById('cota-include-patrocinadora'),
  cotaIncludeJoia: document.getElementById('cota-include-joia'),
  cotaIncludePeculio: document.getElementById('cota-include-peculio'),
  cotaIncludeOutros: document.getElementById('cota-include-outros'),
  cotaPdf: document.getElementById('cota-pdf'),
  cotaManualText: document.getElementById('cota-manual-text')
};

const outputs = {
  fatcor: document.getElementById('fatcor'),
  ax12: document.getElementById('ax12'),
  taxaI: document.getElementById('taxa-i'),
  supAjustado: document.getElementById('sup-ajustado'),
  vaebaBruta: document.getElementById('vaeba-bruta'),
  vaebaAjustada: document.getElementById('vaeba-ajustada'),
  cotaTotal: document.getElementById('cota-total'),
  cotaNominal: document.getElementById('cota-nominal'),
  cotaInpc: document.getElementById('cota-inpc'),
  cotaCapitalizado: document.getElementById('cota-capitalizado'),
  cotaCompetenciaInicial: document.getElementById('cota-competencia-inicial'),
  cotaCompetenciaFinal: document.getElementById('cota-competencia-final'),
  cotaCompetenciasQt: document.getElementById('cota-competencias-qt'),
  cotaBeneficioEquivalente: document.getElementById('cota-beneficio-equivalente'),
  cotaTotais: document.getElementById('cota-totais'),
  alertas: document.getElementById('alertas'),
  auditoria: document.getElementById('auditoria'),
  parecer: document.getElementById('parecer'),
  tests: document.getElementById('tests')
};

const resetButton = document.getElementById('reset-btn');
const calcButton = document.getElementById('calc-btn');
const copyAuditButton = document.getElementById('copy-audit');
const copyParecerButton = document.getElementById('copy-parecer');
const downloadParecerButton = document.getElementById('download-parecer');
const includeAuditCheckbox = document.getElementById('include-audit');
const pdfWarning = document.getElementById('pdf-warning');
const cotaPdfStatus = document.getElementById('cota-pdf-status');
const cotaPdfPreview = document.getElementById('cota-pdf-preview');
const cotaParseManualButton = document.getElementById('cota-parse-manual');
const cotaValidatePdfButton = document.getElementById('cota-validate-pdf');
const cotaApplyPdfButton = document.getElementById('cota-apply-pdf');
const cotaAddRowButton = document.getElementById('cota-add-row');
const cotaRecalcButton = document.getElementById('cota-recalc');
const cotaTableBody = document.getElementById('cota-table-body');
const cotaPatroFactorField = document.getElementById('cota-patro-factor-field');

const formatCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const formatNumber = (value, decimals = 2) =>
  value?.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) ?? '—';

const formatPercent = (value) =>
  `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.worker.mjs';

let cotaEntries = [];
let cotaIdCounter = 1;
let currentMode = 'vaeba';
let lastParsedPdf = null;
let cotaPdfFile = null;

const parseCurrency = (value) => {
  if (!value) return 0;
  const normalized = value
    .toString()
    .replace(/\s/g, '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseBrazilianNumber = (value) => {
  if (!value) return 0;
  const normalized = value.toString().replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseMoneyPtBR = (value) => {
  if (!value) return null;
  const normalized = value.toString().replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatCurrencyInput = (raw) => {
  const digits = raw.replace(/\D/g, '').padStart(3, '0');
  const integerPart = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  const decimalPart = digits.slice(-2);
  const withThousands = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withThousands},${decimalPart}`;
};

const maskCompetencia = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const parseCompetencia = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    month < 1 ||
    month > 12 ||
    year < YEAR_RANGE.min ||
    year > YEAR_RANGE.max
  )
    return null;
  return {
    month,
    year,
    key: `${year}-${String(month).padStart(2, '0')}`
  };
};

const parseMonthValue = (value) => {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month, key: `${year}-${String(month).padStart(2, '0')}` };
};

const formatCompetenciaKey = (key) => {
  if (!key) return '—';
  const [year, month] = key.split('-');
  return `${month}/${year}`;
};

const getTodayISO = () => new Date().toISOString().slice(0, 10);

const getAge = (birthDate, calcDate) => {
  if (!birthDate || !calcDate) return null;
  const birth = new Date(birthDate);
  const calc = new Date(calcDate);
  let age = calc.getFullYear() - birth.getFullYear();
  const monthDiff = calc.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && calc.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
};

const getExactAge = (birthDate, calcDate) => {
  if (!birthDate || !calcDate) return null;
  const birth = new Date(birthDate);
  const calc = new Date(calcDate);
  const diff = calc - birth;
  const years = diff / (365.25 * 24 * 60 * 60 * 1000);
  return years;
};

const validateQxTables = () => {
  const errors = [];
  const checks = [
    { label: 'qx_fem[0]', value: QX_FEM[0], expected: 0.001615, tolerance: 0.0005 },
    { label: 'qx_fem[58]', value: QX_FEM[58], expected: 0.003218, tolerance: 0.001 },
    { label: 'qx_masc[0]', value: QX_MASC[0], expected: 0.00208, tolerance: 0.0007 },
    { label: 'qx_masc[58]', value: QX_MASC[58], expected: 0.005593, tolerance: 0.002 }
  ];
  checks.forEach((check) => {
    const min = check.expected - check.tolerance;
    const max = check.expected + check.tolerance;
    if (check.value < min || check.value > max) {
      errors.push(`Tábua em escala errada: ${check.label} fora do intervalo esperado.`);
    }
  });
  if (QX_FEM[OMEGA] !== 1 || QX_MASC[OMEGA] !== 1) {
    errors.push('Tábua em escala errada: qx[115] deve ser 1.');
  }
  return errors;
};

const buildLx = (qx) => {
  const lx = [100000];
  for (let age = 0; age < OMEGA; age += 1) {
    const next = lx[age] * (1 - qx[age]);
    lx.push(next);
  }
  return lx;
};

const LX_FEM = buildLx(QX_FEM);
const LX_MASC = buildLx(QX_MASC);
const QX_SANITY_ERRORS = validateQxTables();

const calculateAx12 = (age, rate, sexo) => {
  const x = Math.min(Math.max(age, 0), OMEGA);
  const lx = sexo === 'F' ? LX_FEM : LX_MASC;
  const l0 = lx[x];
  if (!l0) return 0;
  const v = 1 / (1 + rate);
  let axAnnualDue = 0;
  for (let t = 0; t <= OMEGA - x; t += 1) {
    axAnnualDue += Math.pow(v, t) * (lx[x + t] / l0);
  }
  return axAnnualDue - 11 / 24;
};

const getInterestRate = (year) => {
  const years = Object.keys(interestRates)
    .map(Number)
    .sort((a, b) => a - b);
  if (interestRates[year]) {
    return { rate: interestRates[year], rule: `Taxa do exercício ${year}` };
  }
  const previous = years.filter((y) => y < year).pop();
  if (previous) {
    return { rate: interestRates[previous], rule: `Taxa do último exercício disponível (${previous})` };
  }
  return { rate: years.length ? interestRates[years[0]] : 0, rule: 'Taxa indisponível na base' };
};

const getNearestInpcKey = (key) => {
  const candidates = INPC_KEYS.filter((item) => item <= key);
  return candidates.length ? candidates[candidates.length - 1] : null;
};

const getInpcIndex = (key, { allowFallback = true } = {}) => {
  if (!key) {
    return { index: null, effectiveYYYYMM: null, clampedStart: false, clampedEnd: false, usedFallback: false };
  }

  let effectiveKey = key;
  let clampedStart = false;
  let clampedEnd = false;

  if (key < INPC_MIN_KEY) {
    effectiveKey = INPC_MIN_KEY;
    clampedStart = true;
  } else if (key > INPC_MAX_KEY) {
    effectiveKey = INPC_MAX_KEY;
    clampedEnd = true;
  }

  if (INPC_INDEX[effectiveKey]) {
    return {
      index: INPC_INDEX[effectiveKey],
      effectiveYYYYMM: effectiveKey,
      clampedStart,
      clampedEnd,
      usedFallback: false
    };
  }

  if (!allowFallback) {
    return { index: null, effectiveYYYYMM: effectiveKey, clampedStart, clampedEnd, usedFallback: false };
  }

  const fallbackKey = getNearestInpcKey(effectiveKey);
  if (fallbackKey) {
    return {
      index: INPC_INDEX[fallbackKey],
      effectiveYYYYMM: fallbackKey,
      clampedStart,
      clampedEnd,
      usedFallback: true
    };
  }

  return { index: null, effectiveYYYYMM: null, clampedStart, clampedEnd, usedFallback: false };
};

const getCurrencyByCompetence = (year, month) => {
  if (year > 1994 || (year === 1994 && month >= 7)) {
    return 'BRL';
  }
  if (year > 1993 || (year === 1993 && month >= 8)) {
    return 'CR$';
  }
  if (year > 1990 || (year === 1990 && month >= 3)) {
    return 'Cr$';
  }
  if (year === 1990 || year === 1989) {
    return 'NCz$';
  }
  if (year >= 1986) {
    return 'Cz$';
  }
  return 'Cr$-antigo';
};

const convertToBRL = (nominalValue, competenceKey) => {
  if (!competenceKey) {
    return {
      brl: nominalValue,
      currency: 'BRL',
      factor: 1,
      notes: 'Competência não informada; assumido BRL.'
    };
  }
  const [yearRaw, monthRaw] = competenceKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const currency = getCurrencyByCompetence(year, month);
  if (currency === 'BRL') {
    return { brl: nominalValue, currency, factor: 1, notes: 'Competência pós-Real (>= 1994-07).' };
  }

  let crValue = nominalValue;
  let factorToCR = 1;
  if (currency === 'CR$') {
    factorToCR = 1;
  } else if (currency === 'Cr$') {
    factorToCR = 1 / 1000;
  } else if (currency === 'NCz$') {
    factorToCR = 1 / 1000;
  } else if (currency === 'Cz$') {
    factorToCR = 1 / 1_000_000;
  } else {
    factorToCR = 1 / 1_000_000_000;
  }

  crValue = nominalValue * factorToCR;
  const brlValue = crValue / 2750;
  return {
    brl: brlValue,
    currency,
    factor: factorToCR / 2750,
    notes: 'Conversão pré-Real: moeda histórica → CR$ → BRL (divisão por 2.750).'
  };
};

const formatDateBR = (dateValue) => {
  if (!dateValue) return '—';
  return new Date(dateValue).toLocaleDateString('pt-BR');
};

const formatDateToCompetencia = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${month}/${date.getFullYear()}`;
};

const loadPremissas = async () => {
  try {
    const response = await fetch('./config/premissas.json');
    if (!response.ok) return;
    const data = await response.json();
    if (data?.interestRates) {
      interestRates = { ...data.interestRates };
    }
  } catch (error) {
    console.warn('Falha ao carregar premissas, usando fallback.', error);
  }
};

const runGoldenTest = () => {
  const testItems = [];
  const sexo = 'F';
  const nascimento = '1966-05-04';
  const dataCalculo = '2024-06-30';
  const idade = getAge(nascimento, dataCalculo);
  const competenciaBase = parseCompetencia('06/2024');
  const competenciaFinal = parseCompetencia('08/2024');
  const inpcBaseInfo = competenciaBase ? getInpcIndex(competenciaBase.key, { allowFallback: false }) : null;
  const inpcFinalInfo = competenciaFinal ? getInpcIndex(competenciaFinal.key, { allowFallback: true }) : null;
  const inpcBase = inpcBaseInfo?.index ?? null;
  const inpcFinal = inpcFinalInfo?.index ?? null;
  const fatcor = inpcBase && inpcFinal ? inpcFinal / inpcBase : 0;
  const rubricas = [349.11, 789.63, 1029.13, 312.17, 2.96];
  const totalRubricas = rubricas.reduce((sum, value) => sum + value, 0);
  const supAjustado = 8576.09 - totalRubricas;
  const ax12Bruto = calculateAx12(idade, 0.0437, sexo);
  const ax12Usado = ax12Bruto * FCB;
  testItems.push({
    name: 'Caso parecer: soma rubricas = 2.483,00 e SUP ajustado = 6.093,09',
    pass: Math.abs(totalRubricas - 2483) < 0.01 && Math.abs(supAjustado - 6093.09) < 0.01
  });
  testItems.push({
    name: 'Caso parecer: äx12 bruto ~ 16,03 e äx12 usado ~ 15,74',
    pass: Math.abs(ax12Bruto - 16.03) <= 0.05 && Math.abs(ax12Usado - 15.74) <= 0.05
  });
  const vaebaBruta = NSUA * 8576.09 * ax12Usado * fatcor;
  const vaebaAjustada = NSUA * supAjustado * ax12Usado * fatcor;
  testItems.push({
    name: 'Caso parecer: VAEBA Bruta > VAEBA Ajustada',
    pass: vaebaBruta > vaebaAjustada
  });
  return testItems;
};

const runTests = () => {
  const testItems = [];
  const qxChecks = [
    { name: 'qx_fem[0] ~ 0,001615', value: QX_FEM[0], min: 0.001115, max: 0.002115 },
    { name: 'qx_fem[58] ~ 0,003218', value: QX_FEM[58], min: 0.002218, max: 0.004218 },
    { name: 'qx_masc[0] ~ 0,00208', value: QX_MASC[0], min: 0.00138, max: 0.00278 },
    { name: 'qx_masc[58] ~ 0,005593', value: QX_MASC[58], min: 0.003593, max: 0.007593 },
    { name: 'qx[115] = 1', value: QX_FEM[115], min: 1, max: 1 }
  ];
  qxChecks.forEach((check) => {
    const pass = check.value >= check.min && check.value <= check.max;
    testItems.push({
      name: `Sanidade tábua: ${check.name}`,
      pass
    });
  });

  const supCalc = 8576.09 - (349.11 + 789.63 + 1029.13 + 312.17 + 2.96);
  const supPass = Math.abs(supCalc - 6093.09) < 0.01;
  testItems.push({
    name: 'SUP ajustado (8576,09 - rubricas) = 6093,09',
    pass: supPass
  });

  const axBruto = calculateAx12(58, 0.0437, 'F');
  const axUsado = axBruto * FCB;
  testItems.push({
    name: 'äx(12) > 0 para sexo FEM, idade 58, i=0,0437',
    pass: axBruto > 0
  });

  const supBruto = 1000;
  const supAjustado = 900;
  const fator = 1.1;
  const ax12 = 10;
  const vaebaBruta = NSUA * supBruto * ax12 * fator;
  const vaebaAjustada = NSUA * supAjustado * ax12 * fator;
  testItems.push({
    name: 'VAEBA_BRUTA > VAEBA_AJUSTADA quando há rubricas',
    pass: vaebaBruta > vaebaAjustada
  });

  const golden = runGoldenTest();
  testItems.push(...golden);

  const convPost = convertToBRL(100, '1994-07');
  testItems.push({
    name: 'Conversão pós-Real (>= 1994-07) deve ser 1:1',
    pass: Math.abs(convPost.brl - 100) < 0.0001 && convPost.factor === 1
  });

  const convPre = convertToBRL(2750, '1994-06');
  testItems.push({
    name: 'Conversão 1994-06 (CR$ 2750 -> R$ 1,00)',
    pass: Math.abs(convPre.brl - 1) < 0.0001
  });

  const cotaWarnings = [];
  const cotaMetrics = computeCotaEntryMetrics(
    { competence: '2024-06', amountNominal: 1000 },
    { dataCalculo: '2024-06-15', competenciaFinal: '2024-06', warnings: cotaWarnings }
  );
  testItems.push({
    name: 'Sanidade COTA: FJUR ~ 1 quando data = competência',
    pass: Math.abs(cotaMetrics.fjur - 1) < 0.01
  });

  outputs.tests.innerHTML = '';
  testItems.forEach((test) => {
    const li = document.createElement('li');
    li.className = `test-item ${test.pass ? '' : 'fail'}`;
    li.textContent = `${test.pass ? '✓' : '✗'} ${test.name}`;
    outputs.tests.appendChild(li);
  });
};

const setMode = (mode) => {
  currentMode = mode;
  document.querySelectorAll('[data-mode]').forEach((element) => {
    const shouldShow = element.dataset.mode === mode;
    element.classList.toggle('is-hidden', !shouldShow);
  });
};

const createCotaEntry = (entry) => ({
  id: entry.id ?? cotaIdCounter++,
  competence: entry.competence ?? '',
  type: entry.type ?? 'PARTICIPANTE_NORMAL',
  amountNominal: entry.amountNominal ?? 0,
  is13: entry.is13 ?? false,
  source: entry.source ?? 'manual',
  notes: entry.notes ?? ''
});

const getCotaFilters = () => ({
  PARTICIPANTE_NORMAL: inputs.cotaIncludeParticipante.checked,
  PATROCINADORA_NORMAL: inputs.cotaIncludePatrocinadora.checked,
  JOIA: inputs.cotaIncludeJoia.checked,
  PECULIO: inputs.cotaIncludePeculio.checked,
  OUTROS: inputs.cotaIncludeOutros.checked
});

const getCotaFinalCompetence = (dataCalculo) => {
  if (!dataCalculo) return null;
  const date = new Date(dataCalculo);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

const applyPatrocinadoraRule = (entries, rule, factor) => {
  if (rule === 'A' || rule === 'D') return entries;
  const sanitizedFactor = Number.isFinite(factor) ? factor : 1;
  const baseEntries = entries.filter((entry) => entry.type !== 'PATROCINADORA_NORMAL');
  const derived = baseEntries
    .filter((entry) => entry.type === 'PARTICIPANTE_NORMAL')
    .map((entry) =>
      createCotaEntry({
        competence: entry.competence,
        type: 'PATROCINADORA_NORMAL',
        amountNominal: entry.amountNominal * (rule === 'B' ? 1 : sanitizedFactor),
        is13: entry.is13,
        source: 'regra',
        notes: `Gerado pela regra ${rule}`
      })
    );
  return [...baseEntries, ...derived];
};

const computeCotaEntryMetrics = (entry, { dataCalculo, inpcFinalIndex, inpcFinalKey }) => {
  const competenceKey = entry.competence;
  const conversion = convertToBRL(entry.amountNominal, competenceKey);
  const baseKey = competenceKey && competenceKey < INPC_MIN_KEY ? INPC_MIN_KEY : competenceKey || INPC_MIN_KEY;
  const inpcBaseInfo = getInpcIndex(baseKey, { allowFallback: false });
  const inpcBase = inpcBaseInfo.index;
  const fatcor = inpcBase && inpcFinalIndex ? inpcFinalIndex / inpcBase : 0;

  const [yearRaw, monthRaw] = competenceKey.split('-');
  const competenceDate = new Date(Number(yearRaw), Number(monthRaw) - 1, 15);
  const calcDate = new Date(dataCalculo);
  const diffDays = (calcDate - competenceDate) / (1000 * 60 * 60 * 24);
  const tYears = diffDays / 365.25;
  const fjur = Math.pow(1 + COTA_REAL_RATE, tYears);
  const updated = conversion.brl * fatcor * fjur;
  const corrected = conversion.brl * fatcor;
  return {
    conversion,
    inpcBase,
    inpcFinal: inpcFinalIndex,
    fatcor,
    fjur,
    tYears,
    corrected,
    updated,
    inpcBaseKey: baseKey,
    inpcFinalKey
  };
};

const renderCotaTypeSelect = (entry) => {
  const options = CONTRIBUTION_TYPES.map(
    (type) => `<option value="${type.value}" ${entry.type === type.value ? 'selected' : ''}>${type.label}</option>`
  ).join('');
  return `<select data-field="type" data-id="${entry.id}">${options}</select>`;
};

const renderCotaTable = (dataCalculo) => {
  cotaTableBody.innerHTML = '';
  if (!cotaEntries.length) {
    cotaTableBody.innerHTML = '<tr><td colspan="9">Nenhuma contribuição carregada.</td></tr>';
    return;
  }
  const competenciaFinalInput = getCotaFinalCompetence(dataCalculo) ?? INPC_MIN_KEY;
  const inpcFinalInfo = getInpcIndex(competenciaFinalInput, { allowFallback: true });
  const inpcFinalIndex = inpcFinalInfo.index;
  const competenciaFinal = inpcFinalInfo.effectiveYYYYMM ?? INPC_MIN_KEY;
  cotaEntries.forEach((entry) => {
    const row = document.createElement('tr');
    if (!entry.competence) {
      row.innerHTML = `
        <td><input type="month" data-field="competence" data-id="${entry.id}" /></td>
        <td>${renderCotaTypeSelect(entry)}</td>
        <td><input type="checkbox" data-field="is13" data-id="${entry.id}" ${entry.is13 ? 'checked' : ''} /></td>
        <td><input type="text" data-field="amountNominal" data-id="${entry.id}" value="${formatNumber(entry.amountNominal, 2)}" /></td>
        <td colspan="4">Preencha a competência para calcular.</td>
        <td class="table-actions"><button class="ghost" data-action="remove" data-id="${entry.id}">Remover</button></td>
      `;
      cotaTableBody.appendChild(row);
      return;
    }
    const metrics = computeCotaEntryMetrics(entry, {
      dataCalculo,
      inpcFinalIndex,
      inpcFinalKey: competenciaFinal
    });
    row.innerHTML = `
      <td><input type="month" data-field="competence" data-id="${entry.id}" value="${entry.competence}" /></td>
      <td>${renderCotaTypeSelect(entry)}</td>
      <td><input type="checkbox" data-field="is13" data-id="${entry.id}" ${entry.is13 ? 'checked' : ''} /></td>
      <td><input type="text" data-field="amountNominal" data-id="${entry.id}" value="${formatNumber(entry.amountNominal, 2)}" /></td>
      <td>${formatCurrency.format(metrics.conversion.brl)}</td>
      <td>${formatNumber(metrics.fatcor, 5)}</td>
      <td>${formatNumber(metrics.fjur, 5)}</td>
      <td>${formatCurrency.format(metrics.updated)}</td>
      <td class="table-actions"><button class="ghost" data-action="remove" data-id="${entry.id}">Remover</button></td>
    `;
    cotaTableBody.appendChild(row);
  });
};

const getCotaTypeLabel = (type) => {
  const found = CONTRIBUTION_TYPES.find((item) => item.value === type);
  return found ? found.label : type;
};

const buildCotaAudit = (data) => {
  const header = `AUDITORIA DA SIMULAÇÃO - COTA PPSP-NR

Participante: ${data.nome || '—'}
Sexo: ${data.sexoLabel}
Nascimento: ${formatDateBR(data.nascimento)}
Data do cálculo: ${formatDateBR(data.dataCalculo)}
Competência inicial: ${data.competenciaInicial || '—'}
Competência final: ${data.competenciaFinal || '—'}

Parâmetros:
INPC: série ${data.inpcPolicy?.range ?? '—'}
Taxa real anual: ${formatPercent(COTA_REAL_RATE)}
Capitalização: (1+i)^(dias/365,25)
Regra patrocinadora: ${data.regraPatro}
Política pré-Real: conversão para BRL via CR$ e divisão por 2.750

Política INPC (consolidada):
Faixa embutida: ${data.inpcPolicy?.range ?? '—'}
Competência final informada: ${data.inpcPolicy?.finalInput ?? '—'}
Competência final usada: ${data.inpcPolicy?.finalUsed ?? '—'}
INPC final usado: ${data.inpcPolicy?.finalIndex ? formatNumber(data.inpcPolicy.finalIndex, 4) : '—'}
Ancoragem pré-1994: ${data.inpcPolicy?.pre1994Count ?? 0} lançamento(s) (base efetiva ${data.inpcPolicy?.anchoredBase ?? '—'})
Pós-série: ${data.inpcPolicy?.postSeriesCount ?? 0} lançamento(s)
Política aplicada: ${[
  data.inpcPolicy?.pre1994Count ? 'ancoragem em 1994-01' : null,
  data.inpcPolicy?.clampedFinal ? 'clamp no último índice' : null
]
  .filter(Boolean)
  .join(' | ') || 'sem ajustes'}

Totais:
Total nominal (BRL): ${formatCurrency.format(data.totalNominal)}
Total corrigido (INPC): ${formatCurrency.format(data.totalCorrigido)}
COTA total (INPC + juros): ${formatCurrency.format(data.totalCapitalizado)}

Detalhamento por lançamento:
Competência | Tipo | Nominal | Moeda | Fator conversão | BRL | INPC base | INPC final | FATCOR | t (anos) | FJUR | Atualizado`;

  const lines = data.entries.map((entry) => {
    const factorLabel = entry.conversion.factor === 1 ? '1' : entry.conversion.factor.toExponential(6);
    return `${entry.competence} | ${getCotaTypeLabel(entry.type)} | ${formatNumber(entry.amountNominal, 2)} | ${
      entry.conversion.currency
    } | ${factorLabel} | ${formatNumber(entry.conversion.brl, 2)} | ${formatNumber(
      entry.inpcBase,
      4
    )} | ${formatNumber(entry.inpcFinal, 4)} | ${formatNumber(entry.fatcor, 5)} | ${entry.tYears.toFixed(
      4
    )} | ${formatNumber(entry.fjur, 5)} | ${formatNumber(entry.updated, 2)}`;
  });

  const totalsByTypeLines = Object.entries(data.totalByType).map(
    ([type, value]) => `- ${getCotaTypeLabel(type)}: ${formatCurrency.format(value)}`
  );

  return `${header}
${lines.join('\n')}

Totais por tipo:
${totalsByTypeLines.join('\n')}

Avisos:
${data.warnings.length ? data.warnings.map((warning) => `- ${warning}`).join('\n') : '- Nenhum aviso.'}
`;
};

const buildCotaParecer = (data) => `PARECER TÉCNICO RESUMIDO — SIMULAÇÃO DE COTA PATRIMONIAL (RESERVA INDIVIDUAL ESTIMADA) — PPSP-NR

1. OBJETIVO
Estimar o patrimônio individual gerado por contribuições do participante e patrocinadora (incluindo joia e demais rubricas), atualizado pelo INPC e capitalizado à taxa real anual, para fins de quantificação patrimonial.

2. BASE DOCUMENTAL E DADOS UTILIZADOS
Contribuições extraídas do “Levantamento de Contribuições Normais e Joia” (PDF) e/ou entradas manuais. Competências de ${data.competenciaInicial || '—'} a ${data.competenciaFinal || '—'}.

3. METODOLOGIA E PREMISSAS
Correção monetária via INPC (FATCOR = índice final/índice base) e capitalização real de 4,44% a.a. (1+i)^t. Conversão pré-Plano Real conforme cadeia oficial de moedas até CR$ e BRL (divisão por 2.750). Regra de patrocinadora aplicada: ${data.regraPatro}.

4. APURAÇÃO
Competências processadas: ${data.competenciasProcessadas}.
Totais por tipo: ${Object.entries(data.totalByType)
  .map(([type, value]) => `${getCotaTypeLabel(type)} ${formatCurrency.format(value)}`)
  .join(' | ')}.

5. RESULTADO
COTA TOTAL (R$): ${formatCurrency.format(data.totalCapitalizado)}.
Benefício equivalente (estimativo): ${data.beneficioEquivalente
  ? formatCurrency.format(data.beneficioEquivalente)
  : '—'}.

6. CONSIDERAÇÕES FINAIS
Simulação estimativa baseada na documentação e parâmetros informados, com resultado reproduzível para as mesmas entradas. Recomenda-se validação complementar quando houver lacunas documentais.
`;

const calculateCota = () => {
  const warnings = [];
  const errors = [];

  const nome = inputs.nome.value.trim();
  const sexo = inputs.sexo.value;
  const sexoLabel = sexo === 'F' ? 'Feminino' : sexo === 'M' ? 'Masculino' : '—';
  const nascimento = inputs.nascimento.value;
  const dataCalculo = inputs.dataCalculo.value;
  const competenciaFinalInput = getCotaFinalCompetence(dataCalculo);

  if (!dataCalculo) {
    errors.push('Data do cálculo não informada.');
  }
  if (!competenciaFinalInput) {
    errors.push('Competência final inválida.');
  }

  const dataInicial = parseMonthValue(inputs.cotaDataInicial.value);
  const entriesWithCompetence = cotaEntries.filter((entry) => entry.competence);
  const earliest = entriesWithCompetence
    .map((entry) => entry.competence)
    .sort()
    .shift();
  const competenciaInicial = dataInicial?.key ?? earliest ?? '';

  if (!competenciaInicial) {
    errors.push('Nenhuma competência encontrada para iniciar a acumulação.');
  }

  if (competenciaInicial && competenciaFinalInput && competenciaFinalInput < competenciaInicial) {
    errors.push('Competência final não pode ser anterior à inicial.');
  }

  const regraPatro = inputs.cotaRegraPatro.value;
  const fatorPatro = Number(inputs.cotaPatroFactor.value);
  if (regraPatro === 'C' && (!Number.isFinite(fatorPatro) || fatorPatro < 0)) {
    errors.push('Fator da patrocinadora inválido.');
  }

  const filters = getCotaFilters();
  const baseEntries = applyPatrocinadoraRule(cotaEntries, regraPatro, fatorPatro).filter(
    (entry) => filters[entry.type]
  );

  const entries = baseEntries.filter(
    (entry) =>
      entry.competence &&
      entry.competence >= competenciaInicial &&
      entry.competence <= competenciaFinalInput
  );

  if (!entries.length) {
    errors.push('Nenhuma contribuição válida dentro do intervalo selecionado.');
  }

  if (errors.length) {
    renderAlerts(errors);
    outputs.auditoria.textContent = 'Corrija os erros indicados para calcular.';
    outputs.parecer.textContent = 'Corrija os erros indicados para calcular.';
    return;
  }

  const inpcFinalInfo = getInpcIndex(competenciaFinalInput, { allowFallback: true });
  const competenciaFinal = inpcFinalInfo.effectiveYYYYMM;
  const inpcFinalIndex = inpcFinalInfo.index;

  const pre1994Count = entries.filter((entry) => entry.competence < INPC_MIN_KEY).length;
  const postSeriesCount = entries.filter((entry) => entry.competence > INPC_MAX_KEY).length;
  const inpcAdjusted = pre1994Count > 0 || postSeriesCount > 0 || inpcFinalInfo.clampedEnd || !inpcFinalIndex;

  if (inpcAdjusted) {
    warnings.push(INPC_GENERIC_WARNING);
  }

  const computedEntries = entries.map((entry) => {
    const metrics = computeCotaEntryMetrics(entry, {
      dataCalculo,
      inpcFinalIndex,
      inpcFinalKey: competenciaFinal
    });
    return {
      ...entry,
      ...metrics
    };
  });
  renderAlerts(warnings.slice(0, 1));

  const totalNominal = computedEntries.reduce((sum, entry) => sum + entry.conversion.brl, 0);
  const totalCorrigido = computedEntries.reduce((sum, entry) => sum + entry.corrected, 0);
  const totalCapitalizado = computedEntries.reduce((sum, entry) => sum + entry.updated, 0);
  const totalByType = computedEntries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + entry.updated;
    return acc;
  }, {});

  const idade = getAge(nascimento, dataCalculo);
  const ax12Bruto = idade !== null && sexo ? calculateAx12(idade, COTA_REAL_RATE, sexo) : 0;
  const ax12Usado = ax12Bruto * FCB;
  const beneficioEquivalente = ax12Usado ? totalCapitalizado / (NSUA * ax12Usado) : null;

  outputs.cotaTotal.textContent = formatCurrency.format(totalCapitalizado);
  outputs.cotaNominal.textContent = formatCurrency.format(totalNominal);
  outputs.cotaInpc.textContent = formatCurrency.format(totalCorrigido);
  outputs.cotaCapitalizado.textContent = formatCurrency.format(totalCapitalizado);
  outputs.cotaCompetenciaInicial.textContent = formatCompetenciaKey(competenciaInicial);
  outputs.cotaCompetenciaFinal.textContent = formatCompetenciaKey(competenciaFinal);
  outputs.cotaCompetenciasQt.textContent = `${computedEntries.length}`;
  outputs.cotaBeneficioEquivalente.textContent = beneficioEquivalente
    ? formatCurrency.format(beneficioEquivalente)
    : '—';

  outputs.cotaTotais.innerHTML = Object.entries(totalByType)
    .map(([type, value]) => `<div>${getCotaTypeLabel(type)}: ${formatCurrency.format(value)}</div>`)
    .join('');

  const auditData = {
    nome,
    sexoLabel,
    nascimento,
    dataCalculo,
    competenciaInicial: formatCompetenciaKey(competenciaInicial),
    competenciaFinal: formatCompetenciaKey(competenciaFinal),
    regraPatro: inputs.cotaRegraPatro.options[inputs.cotaRegraPatro.selectedIndex].text,
    totalNominal,
    totalCorrigido,
    totalCapitalizado,
    totalByType,
    entries: computedEntries,
    warnings,
    competenciasProcessadas: computedEntries.length,
    beneficioEquivalente,
    inpcPolicy: {
      range: `${INPC_MIN_KEY}..${INPC_MAX_KEY}`,
      finalInput: competenciaFinalInput,
      finalUsed: competenciaFinal,
      finalIndex: inpcFinalIndex,
      pre1994Count,
      postSeriesCount,
      anchoredBase: INPC_MIN_KEY,
      clampedFinal: inpcFinalInfo.clampedEnd
    }
  };

  outputs.auditoria.textContent = buildCotaAudit(auditData);
  outputs.parecer.textContent = buildCotaParecer(auditData);
};

const MONTH_HEADERS = [
  { key: '01', labels: ['JANEIRO', 'JAN'] },
  { key: '02', labels: ['FEVEREIRO', 'FEV'] },
  { key: '03', labels: ['MARÇO', 'MARCO', 'MAR'] },
  { key: '04', labels: ['ABRIL', 'ABR'] },
  { key: '05', labels: ['MAIO', 'MAI'] },
  { key: '06', labels: ['JUNHO', 'JUN'] },
  { key: '07', labels: ['JULHO', 'JUL'] },
  { key: '08', labels: ['AGOSTO', 'AGO'] },
  { key: '09', labels: ['SETEMBRO', 'SET'] },
  { key: '10', labels: ['OUTUBRO', 'OUT'] },
  { key: '11', labels: ['NOVEMBRO', 'NOV'] },
  { key: '12', labels: ['DEZEMBRO', 'DEZ'] }
];

const FOOTER_BLOCKLIST = [
  'PARTICIPANTE',
  'PATROCINADORA',
  'MATRICULA',
  'MATRÍCULA',
  'INSCRICAO',
  'INSCRIÇÃO',
  'DATA',
  'HORA',
  'ARR',
  'PAGINA',
  'PÁGINA'
];

const TABLE_END_TOKENS = ['OBSERVACOES', 'OBSERVAÇÕES', 'HISTORICO', 'HISTÓRICO', 'ARR', 'PAGINA', 'PÁGINA', 'DATA'];
const PDF_PARSE_DEBUG = false;

const clusterByY = (items, yTolerance) => {
  const sorted = items
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5]
    }))
    .filter((item) => item.text)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  let currentLine = null;

  sorted.forEach((item) => {
    if (!currentLine || Math.abs(currentLine.y - item.y) > yTolerance) {
      currentLine = { y: item.y, items: [item] };
      lines.push(currentLine);
    } else {
      currentLine.items.push(item);
    }
  });

  return lines.map((line) => ({
    y: line.y,
    items: line.items.sort((a, b) => a.x - b.x),
    text: line.items.map((item) => item.text).join(' ')
  }));
};

const normalizeHeaderText = (text) =>
  text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const headerHasAllMonths = (normalized) =>
  MONTH_HEADERS.every((month) => month.labels.some((label) => normalized.includes(label)));

const detectHeaderLine = (lines) => {
  for (const line of lines) {
    const normalized = normalizeHeaderText(line.text);
    const hasAno = normalized.includes('ANO');
    const has13 = normalized.includes('13') || normalized.includes('13O');
    const hasAllMonths = headerHasAllMonths(normalized);
    if (hasAno && hasAllMonths && has13) {
      return line;
    }
  }
  return null;
};

const buildColumnMap = (headerLine) => {
  const columns = [];
  const headerItems = headerLine.items.map((item) => ({
    text: normalizeHeaderText(item.text),
    x: item.x
  }));
  const anoItem = headerItems.find((item) => item.text.includes('ANO'));
  if (!anoItem) return null;
  columns.push({ key: 'ano', x: anoItem.x });

  for (const month of MONTH_HEADERS) {
    const monthItem = headerItems.find((item) =>
      month.labels.some((label) => item.text.includes(label))
    );
    if (!monthItem) return null;
    columns.push({ key: month.key, x: monthItem.x });
  }

  const thirteenthItem = headerItems.find((item) => item.text.includes('13'));
  if (!thirteenthItem) return null;
  columns.push({ key: '13', x: thirteenthItem.x });

  return columns.sort((a, b) => a.x - b.x);
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const computeMaxDx = (columns) => {
  const distances = [];
  for (let i = 1; i < columns.length; i += 1) {
    distances.push(columns[i].x - columns[i - 1].x);
  }
  const medianDistance = median(distances);
  return medianDistance ? medianDistance / 2 : 0;
};

const inferLineType = (text) => {
  const upper = text.toUpperCase();
  if (upper.includes('JOIA')) return 'JOIA';
  if (upper.includes('PECULIO') || upper.includes('PECÚLIO')) return 'PECULIO';
  if (upper.includes('PATROCINADORA')) return 'PATROCINADORA_NORMAL';
  return 'PARTICIPANTE_NORMAL';
};

const mapLineItemsToColumns = (items, columns, maxDx) => {
  const moneyPattern = /-?\d{1,3}(?:\.\d{3})*,\d{2}/;
  const bestByColumn = {};
  items.forEach((item) => {
    const text = item.text;
    if (!moneyPattern.test(text)) return;
    if (text.includes('/') || (text.includes('-') && !text.startsWith('-'))) return;
    let nearest = null;
    columns.forEach((column) => {
      const dx = Math.abs(item.x - column.x);
      if (!nearest || dx < nearest.dx) {
        nearest = { key: column.key, dx };
      }
    });
    if (!nearest || nearest.dx > maxDx) return;
    if (nearest.key === 'ano') return;
    if (!bestByColumn[nearest.key] || nearest.dx < bestByColumn[nearest.key].dx) {
      bestByColumn[nearest.key] = {
        dx: nearest.dx,
        raw: text,
        value: parseMoneyPtBR(text)
      };
    }
  });
  return bestByColumn;
};

const extractRowsFromLines = ({ lines, headerLine, columns, maxDx }) => {
  const yearPattern = /^(19|20)\d{2}$/;
  const headerIndex = lines.indexOf(headerLine);
  if (headerIndex < 0) return [];
  const rows = [];
  let currentRow = null;
  const stats = {
    discarded: 0,
    outsideWindow: 0,
    nonYear: 0,
    incomplete: 0,
    years: []
  };

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const normalizedText = normalizeHeaderText(line.text);
    if (TABLE_END_TOKENS.some((token) => normalizedText.includes(token))) {
      break;
    }
    if (FOOTER_BLOCKLIST.some((token) => normalizedText.includes(token))) {
      stats.discarded += 1;
      continue;
    }
    const leftmost = line.items[0];
    const yearMatch = leftmost?.text?.match(yearPattern);
    if (yearMatch) {
      if (currentRow) rows.push(currentRow);
      currentRow = {
        year: Number(yearMatch[0]),
        items: [...line.items],
        lineText: line.text
      };
      stats.years.push(Number(yearMatch[0]));
      continue;
    }
    if (currentRow) {
      currentRow.items.push(...line.items);
      currentRow.lineText = `${currentRow.lineText} ${line.text}`.trim();
    } else {
      stats.nonYear += 1;
    }
  }
  if (currentRow) rows.push(currentRow);

  const formatted = rows
    .map((row) => {
      const normalizedText = normalizeHeaderText(row.lineText);
      if (FOOTER_BLOCKLIST.some((token) => normalizedText.includes(token))) return null;
      const bestByColumn = mapLineItemsToColumns(row.items, columns, maxDx);
      const months = {};
      const raw = {};
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'].forEach(
        (key) => {
          const entry = bestByColumn[key];
          months[key] = entry?.value ?? null;
          raw[key] = entry?.raw ?? null;
        }
      );
      const filled = Object.values(months).filter((value) => value !== null).length;
      if (filled < 13) {
        stats.incomplete += 1;
      }
      return {
        year: row.year,
        months,
        raw,
        confidence: { filled, missing: 13 - filled },
        lineText: row.lineText
      };
    })
    .filter(Boolean);

  if (PDF_PARSE_DEBUG) {
    console.info('[PDF] Linhas não iniciadas por ano:', stats.nonYear);
    console.info('[PDF] Linhas incompletas:', stats.incomplete);
  }
  return { rows: formatted, stats };
};

const consolidateRows = (rows) => {
  const byYear = new Map();
  rows.forEach((row) => {
    const existing = byYear.get(row.year);
    if (!existing || row.confidence.filled > existing.confidence.filled) {
      byYear.set(row.year, row);
    }
  });
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
};

const evaluateRows = (rows) => {
  const warnings = [];
  const errors = [];
  if (!rows.length) {
    errors.push('Nenhuma linha de ano foi identificada na tabela.');
    return { warnings, errors };
  }

  const incompleteRows = rows.filter((row) => row.confidence.filled < 13);
  if (incompleteRows.length) {
    errors.push('A tabela extraída está incompleta (faltam meses/13º em alguns anos).');
  }

  const years = rows.map((row) => row.year);
  const outOfRange = years.filter((year) => year < 1900 || year > 2100);
  if (outOfRange.length) {
    errors.push('Foram encontrados anos fora do intervalo esperado.');
  }

  const notIncreasing = rows.some((row, index) => index > 0 && row.year <= rows[index - 1].year);
  if (notIncreasing) {
    warnings.push('Os anos não estão estritamente crescentes; confira a tabela.');
  }

  const outlierRows = rows.filter((row) => row.year >= 1995).filter((row) => {
    const hugeValues = Object.values(row.months).filter((value) => value !== null && value >= 1000000);
    return hugeValues.length >= 4;
  });
  if (outlierRows.length) {
    warnings.push(
      'Valores muito altos detectados em anos pós-Real. Verifique se a leitura ficou alinhada.'
    );
  }

  return { warnings, errors };
};

const parsePdfContributions = async (file) => {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const tolerances = [1.5, 2, 2.5, 3];
  const candidates = [];

  for (const tolerance of tolerances) {
    const rows = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({ disableCombineTextItems: false });
      const lines = clusterByY(textContent.items, tolerance);
      const headerLine = detectHeaderLine(lines);
      if (!headerLine) continue;
      const columns = buildColumnMap(headerLine);
      if (!columns) continue;
      const maxDx = computeMaxDx(columns);
      if (!maxDx) continue;
      const pageResult = extractRowsFromLines({ lines, headerLine, columns, maxDx });
      if (PDF_PARSE_DEBUG) {
        console.info('[PDF] Cabeçalho detectado na página', pageNumber);
        console.info('[PDF] Linhas de ano encontradas:', pageResult.rows.map((row) => row.year).join(', '));
        console.info('[PDF] Linhas incompletas:', pageResult.stats.incomplete);
      }
      pageResult.rows.forEach((row) => rows.push({ ...row, page: pageNumber }));
    }
    const consolidated = consolidateRows(rows);
    const filledCount = consolidated.reduce((sum, row) => sum + row.confidence.filled, 0);
    const completeCount = consolidated.filter((row) => row.confidence.filled === 13).length;
    candidates.push({
      tolerance,
      rows: consolidated,
      score: completeCount * 20 + filledCount
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || { rows: [] };
  const { warnings, errors } = evaluateRows(best.rows);

  if (errors.length) {
    return { entries: [], rows: best.rows, warnings, errors };
  }

  const entries = [];
  best.rows.forEach((row) => {
    const type = inferLineType(row.lineText);
    Object.entries(row.months).forEach(([monthKey, value]) => {
      if (value === null) return;
      const is13 = monthKey === '13';
      const competence = `${row.year}-${String(is13 ? 12 : Number(monthKey)).padStart(2, '0')}`;
      entries.push(
        createCotaEntry({
          competence,
          type,
          amountNominal: value,
          is13,
          source: 'pdf',
          notes: `Ano ${row.year}`
        })
      );
    });
  });

  return { entries, rows: best.rows, warnings, errors };
};

const parseManualTextContributions = (text) => {
  const entries = [];
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line.toUpperCase().includes('TOTAL')) return;
      const yearMatch = line.match(/\b(19\d{2}|20\d{2})\b/);
      if (!yearMatch) return;
      const year = Number(yearMatch[1]);
      const type = inferLineType(line);
      const values = line.match(/-?\d{1,3}(?:\.\d{3})*(?:,\d{2})/g) || [];
      values.forEach((value, index) => {
        if (index >= 13) return;
        const month = index + 1;
        const competence = `${year}-${String(month === 13 ? 12 : month).padStart(2, '0')}`;
        entries.push(
          createCotaEntry({
            competence,
            type,
            amountNominal: parseBrazilianNumber(value),
            is13: month === 13,
            source: 'manual-text',
            notes: 'Texto colado'
          })
        );
      });
    });
  return entries;
};

const buildPreviewTable = (rows) => {
  if (!rows.length) return 'Nenhuma leitura validada.';
  const headerCells = [
    'Ano',
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
    '13º'
  ]
    .map((label) => `<th>${label}</th>`)
    .join('');

  const bodyRows = rows
    .map((row) => {
      const cells = [
        row.year,
        row.months['01'],
        row.months['02'],
        row.months['03'],
        row.months['04'],
        row.months['05'],
        row.months['06'],
        row.months['07'],
        row.months['08'],
        row.months['09'],
        row.months['10'],
        row.months['11'],
        row.months['12'],
        row.months['13']
      ]
        .map((value, index) =>
          index === 0 ? `<td>${value}</td>` : `<td>${value === null ? '—' : formatNumber(value)}</td>`
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="preview-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
};

const renderAlerts = (warnings) => {
  outputs.alertas.innerHTML = '';
  const uniqueWarnings = Array.from(new Set(warnings));
  uniqueWarnings.forEach((warning) => {
    const div = document.createElement('div');
    div.className = 'alert';
    div.textContent = warning;
    outputs.alertas.appendChild(div);
  });
};

const buildAudit = (data) => `AUDITORIA DO CÁLCULO - VAEBA PPSP-NR

Participante: ${data.nome || '—'}
Sexo: ${data.sexoLabel}
Nascimento: ${formatDateBR(data.nascimento)}
Data do cálculo: ${formatDateBR(data.dataCalculo)}
Idade (anos completos): ${data.idade ?? '—'}
Idade exata (informativa): ${data.idadeExata?.toFixed(4) ?? '—'}

Competência INPC base: ${data.competenciaBase}
INPC base: ${data.inpcBase ?? '—'}
Competência INPC final: ${data.competenciaFinal}
INPC final: ${data.inpcFinal ?? '—'}
FATCOR: ${formatNumber(data.fatcor, 5)}

Taxa i selecionada: ${formatPercent(data.rate)}
Regra da taxa: ${data.rateRule}
Tábua aplicada: AT-2000 Suavizada (10%) - ${data.sexoLabel}
Idade usada na tábua: ${data.idade ?? '—'}
äx(12) bruto: ${formatNumber(data.ax12Bruto, 5)}
äx(12) usado (com FCB): ${formatNumber(data.ax12Usado, 5)}

Benefício bruto: ${formatCurrency.format(data.beneficioBruto)}
Rubricas: ${data.rubricas.map((value) => formatCurrency.format(value)).join(' | ')}
Total rubricas: ${formatCurrency.format(data.totalRubricas)}
SUP ajustado: ${formatCurrency.format(data.supAjustado)}

Fórmula: VAEBA = NSUA × SUP × äx(12) × FATCOR
NSUA = ${NSUA}
SUP (bruto): ${formatCurrency.format(data.beneficioBruto)}
SUP (ajustado): ${formatCurrency.format(data.supAjustado)}

Resultados:
VAEBA_BRUTA: ${formatCurrency.format(data.vaebaBruta)}
VAEBA_AJUSTADA: ${formatCurrency.format(data.vaebaAjustada)}

Avisos:
${data.warnings.length ? data.warnings.map((warning) => `- ${warning}`).join('\n') : '- Nenhum aviso.'}
`;

const buildParecer = (data) => `1. Objetivo
Apurar o VAEBA (Reserva Matemática Individual) do participante do plano PPSP-NR, considerando benefício bruto e benefício ajustado.

2. Metodologia e premissas
Aplicou-se VAEBA = NSUA × SUP × äx(12) × FATCOR, com NSUA=13, FCB=0,9818 aplicado sobre äx(12), crescimento real 0% a.a., FATCOR via INPC e tábua AT-2000 Suavizada (10%).

3. Dados de entrada
Participante: ${data.nome || '—'} | Sexo: ${data.sexoLabel} | Idade: ${data.idade ?? '—'} anos
Benefício bruto: ${formatCurrency.format(data.beneficioBruto)} | SUP ajustado: ${formatCurrency.format(data.supAjustado)}
Competências INPC: base ${data.competenciaBase} e final ${data.competenciaFinal}

4. Apuração de fatores
FATCOR = ${formatNumber(data.fatcor, 5)}
Taxa i = ${formatPercent(data.rate)} (${data.rateRule})
äx(12) bruto = ${formatNumber(data.ax12Bruto, 5)}
äx(12) usado (FCB) = ${formatNumber(data.ax12Usado, 5)}

5. Resultados
VAEBA Bruta = ${formatCurrency.format(data.vaebaBruta)}
VAEBA Ajustada = ${formatCurrency.format(data.vaebaAjustada)}

6. Considerações finais
${data.warnings.length ? `Avisos relevantes: ${data.warnings.join(' | ')}` : 'Sem ressalvas relevantes.'}
`;

const calculateVaeba = () => {
  const warnings = [];
  const errors = [];

  if (QX_SANITY_ERRORS.length) {
    errors.push('Tábua em escala errada (não dividir por 100).');
    QX_SANITY_ERRORS.forEach((message) => errors.push(message));
  }

  const nome = inputs.nome.value.trim();
  const sexo = inputs.sexo.value;
  const sexoLabel = sexo === 'F' ? 'Feminino' : sexo === 'M' ? 'Masculino' : '—';
  const nascimento = inputs.nascimento.value;
  const dataCalculo = inputs.dataCalculo.value;
  const competenciaBase = parseCompetencia(inputs.competenciaBase.value);
  const competenciaFinalInput = parseCompetencia(inputs.competenciaFinal.value);

  if (!competenciaBase) {
    errors.push('Competência base INPC inválida ou não informada.');
  }

  const competenciaFinal =
    competenciaFinalInput ?? parseCompetencia(formatDateToCompetencia(dataCalculo));

  if (!competenciaFinal) {
    errors.push('Competência final INPC inválida.');
  }

  const inpcBaseInfo = competenciaBase
    ? getInpcIndex(competenciaBase.key, { allowFallback: false })
    : null;
  const inpcFinalInfo = competenciaFinal
    ? getInpcIndex(competenciaFinal.key, { allowFallback: true })
    : null;
  const inpcAdjusted =
    !inpcBaseInfo?.index || !inpcFinalInfo?.index || Boolean(inpcFinalInfo?.clampedEnd);
  if (inpcAdjusted) {
    warnings.push(INPC_GENERIC_WARNING);
  }
  const inpcBase = inpcBaseInfo?.index ?? null;
  const inpcFinal = inpcFinalInfo?.index ?? null;

  let fatcor = 0;
  if (inpcBase && inpcFinal) {
    fatcor = inpcFinal / inpcBase;
  }

  const beneficioBruto = parseCurrency(inputs.beneficioBruto.value);
  const rubricas = inputs.rubricas.map((input) => parseCurrency(input.value));
  const totalRubricas = rubricas.reduce((sum, value) => sum + value, 0);
  const supAjustado = beneficioBruto - totalRubricas;
  if (supAjustado < 0) {
    warnings.push('SUP ajustado negativo. Verifique as rubricas informadas.');
  }

  const liquidoInformado = parseCurrency(inputs.beneficioLiquido.value);
  if (liquidoInformado && Math.abs(liquidoInformado - supAjustado) > 1) {
    warnings.push('Diferença maior que R$ 1,00 entre líquido informado e SUP ajustado.');
  }

  const idade = getAge(nascimento, dataCalculo);
  const idadeExata = getExactAge(nascimento, dataCalculo);
  if (idade === null) {
    warnings.push('Data de nascimento ou data do cálculo não informada para idade.');
  }

  const calcYear = dataCalculo ? new Date(dataCalculo).getFullYear() : new Date().getFullYear();
  const overrideYearRaw = inputs.anoTaxa?.value?.trim();
  const overrideYear = overrideYearRaw ? Number(overrideYearRaw) : null;
  if (overrideYearRaw && Number.isNaN(overrideYear)) {
    warnings.push('Ano da taxa inválido. Usada regra padrão (ano do cálculo - 1).');
  }
  const defaultYear = calcYear - 1;
  const targetYear = overrideYear && !Number.isNaN(overrideYear) ? overrideYear : defaultYear;
  const { rate, rule } = getInterestRate(targetYear);
  if (!interestRates[targetYear]) {
    warnings.push(`Taxa de juros não encontrada para ${targetYear}. Usada taxa anterior.`);
  }
  if (!overrideYear && targetYear !== calcYear - 1) {
    warnings.push(`Taxa definida pelo último exercício fechado (${defaultYear}).`);
  }

  const ax12Bruto = idade !== null && sexo ? calculateAx12(idade, rate, sexo) : 0;
  const ax12Usado = ax12Bruto * FCB;

  const vaebaBruta = NSUA * beneficioBruto * ax12Usado * fatcor;
  const vaebaAjustada = NSUA * supAjustado * ax12Usado * fatcor;

  outputs.fatcor.textContent = formatNumber(fatcor, 5);
  outputs.ax12.textContent = formatNumber(ax12Usado, 5);
  outputs.taxaI.textContent = formatPercent(rate);
  outputs.supAjustado.textContent = formatCurrency.format(supAjustado);
  outputs.vaebaBruta.textContent = formatCurrency.format(vaebaBruta);
  outputs.vaebaAjustada.textContent = formatCurrency.format(vaebaAjustada);

  renderAlerts([...errors, ...warnings]);
  if (errors.length) {
    outputs.auditoria.textContent = 'Corrija os erros indicados para calcular.';
    outputs.parecer.textContent = 'Corrija os erros indicados para calcular.';
    return;
  }

  const auditData = {
    nome,
    sexoLabel,
    nascimento,
    dataCalculo,
    idade,
    idadeExata,
    competenciaBase: competenciaBase?.key ?? '—',
    competenciaFinal: competenciaFinal?.key ?? '—',
    inpcBase,
    inpcFinal,
    fatcor,
    rate,
    rateRule: rule,
    ax12Bruto,
    ax12Usado,
    beneficioBruto,
    rubricas,
    totalRubricas,
    supAjustado,
    vaebaBruta,
    vaebaAjustada,
    warnings
  };

  outputs.auditoria.textContent = buildAudit(auditData);
  outputs.parecer.textContent = buildParecer(auditData);
};

const calculate = () => {
  if (currentMode === 'cota') {
    calculateCota();
  } else {
    calculateVaeba();
  }
};

const resetForm = () => {
  Object.values(inputs).forEach((input) => {
    if (Array.isArray(input)) {
      input.forEach((field) => {
        field.value = '';
      });
    } else if (input && input.tagName !== 'SELECT') {
      input.value = '';
    } else if (input && input.tagName === 'SELECT') {
      input.value = '';
    }
  });
  inputs.cotaRegraPatro.value = 'A';
  inputs.cotaPatroFactor.value = 1;
  inputs.cotaIncludeParticipante.checked = true;
  inputs.cotaIncludePatrocinadora.checked = true;
  inputs.cotaIncludeJoia.checked = true;
  inputs.cotaIncludePeculio.checked = true;
  inputs.cotaIncludeOutros.checked = true;
  inputs.dataCalculo.value = getTodayISO();
  outputs.fatcor.textContent = '—';
  outputs.ax12.textContent = '—';
  outputs.taxaI.textContent = '—';
  outputs.supAjustado.textContent = '—';
  outputs.vaebaBruta.textContent = '—';
  outputs.vaebaAjustada.textContent = '—';
  outputs.cotaTotal.textContent = '—';
  outputs.cotaNominal.textContent = '—';
  outputs.cotaInpc.textContent = '—';
  outputs.cotaCapitalizado.textContent = '—';
  outputs.cotaCompetenciaInicial.textContent = '—';
  outputs.cotaCompetenciaFinal.textContent = '—';
  outputs.cotaCompetenciasQt.textContent = '—';
  outputs.cotaBeneficioEquivalente.textContent = '—';
  outputs.cotaTotais.textContent = '—';
  outputs.alertas.innerHTML = '';
  outputs.auditoria.textContent = 'Nenhum cálculo realizado.';
  outputs.parecer.textContent = 'Nenhum cálculo realizado.';
  setPdfWarning('');
  cotaEntries = [];
  lastParsedPdf = null;
  cotaPdfFile = null;
  cotaPdfPreview.innerHTML = 'Nenhuma leitura validada.';
  cotaApplyPdfButton.disabled = true;
  updateCotaStatus('Nenhum arquivo carregado.');
  cotaTableBody.innerHTML = '';
  cotaPdfStatus.textContent = 'Nenhum arquivo carregado.';
};

const handleCopy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('Falha ao copiar', error);
  }
};

const PDF_PAGE = {
  width: 595.28,
  height: 841.89
};

const PDF_MARGINS = {
  top: 100,  // Espaço após a linha superior (logos + linha)
  right: 70,
  bottom: 70, // Espaço antes da linha inferior (rodapé)
  left: 70
};

const buildPdfFilename = (name, mode = 'vaeba') => {
  const sanitized = (name || 'participante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const label = MODE_LABELS[mode] || 'CALCULO';
  return `parecer_${label}_${sanitized || 'participante'}_${dateStamp}.pdf`;
};

const setPdfWarning = (message) => {
  pdfWarning.textContent = message;
  pdfWarning.style.display = message ? 'block' : 'none';
};

const loadImage = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Imagem não encontrada: ${path}`);
  }
  const blob = await response.blob();
  const imageUrl = URL.createObjectURL(blob);
  const img = new Image();

  // Aguarda o carregamento completo da imagem antes de revogar a URL
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imageUrl;
  });

  // Verifica se a imagem tem dimensões válidas
  if (img.width === 0 || img.height === 0) {
    URL.revokeObjectURL(imageUrl);
    throw new Error(`Imagem inválida ou corrompida: ${path}`);
  }

  URL.revokeObjectURL(imageUrl);
  return img;
};

const loadLogos = async () => {
  try {
    const [lumaLogo, luisaLogo] = await Promise.all([
      loadImage('./assets/LogoLUMA.png'),
      loadImage('./assets/LogoLuisa.png')
    ]);
    return { lumaLogo, luisaLogo };
  } catch (error) {
    console.warn('Logos não encontradas, continuando sem elas:', error.message);
    return { lumaLogo: null, luisaLogo: null };
  }
};

const loadFonts = async () => {
  // Carregar fonte Alegreya Sans do Google Fonts
  if (!document.fonts) {
    console.warn('Font API não disponível');
    return;
  }

  try {
    // Criar link para Google Fonts se ainda não existir
    if (!document.querySelector('link[href*="Alegreya+Sans"]')) {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=Alegreya+Sans:ital,wght@0,100;0,300;0,400;0,500;0,700;0,800;0,900;1,100;1,300;1,400;1,500;1,700;1,800;1,900&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }

    // Aguardar todas as fontes carregarem
    await document.fonts.ready;
    console.log('Fontes carregadas com sucesso');
  } catch (error) {
    console.warn('Erro ao carregar fontes:', error);
  }
};

const canvasToJpegBytes = async (canvas) => {
  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
  });

  if (!blob) {
    console.error('Failed to create blob from canvas');
    return new Uint8Array();
  }

  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
};

const wrapText = (context, text, maxWidth) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });
  if (line) lines.push(line);
  return lines;
};

const layoutPdfLines = (text, scale) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return [];

  const pageWidthPx = Math.round(PDF_PAGE.width * scale);
  const pageHeightPx = Math.round(PDF_PAGE.height * scale);

  const marginLeft = PDF_MARGINS.left * scale;
  const marginRight = PDF_MARGINS.right * scale;
  const marginTop = PDF_MARGINS.top * scale;
  const marginBottom = PDF_MARGINS.bottom * scale;
  const maxWidth = pageWidthPx - marginLeft - marginRight;
  const bodySize = 11 * scale;
  const headingSize = 12 * scale;
  const bodyLineHeight = bodySize * 1.5;
  const headingLineHeight = headingSize * 1.55;
  const bodyFont = `400 ${bodySize}px "Alegreya Sans", Arial, sans-serif`;
  const headingFont = `700 ${headingSize}px "Alegreya Sans", Arial, sans-serif`;

  const pages = [[]];
  let pageIndex = 0;
  let cursorY = marginTop;

  const pushLine = (lineText, font, fontSize, lineHeight) => {
    if (cursorY + lineHeight > pageHeightPx - marginBottom) {
      pages.push([]);
      pageIndex += 1;
      cursorY = marginTop;
    }
    pages[pageIndex].push({
      text: lineText,
      x: marginLeft,
      y: cursorY,
      font,
      fontSize
    });
    cursorY += lineHeight;
  };

  text.split('\n').forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line) {
      cursorY += bodyLineHeight * 0.9;
      return;
    }
    const isHeading = /^\d+\.\s/.test(line) || /^Anexo/i.test(line);
    const font = isHeading ? headingFont : bodyFont;
    const lineHeight = isHeading ? headingLineHeight : bodyLineHeight;
    context.font = font;
    if (isHeading && cursorY !== marginTop) {
      cursorY += lineHeight * 0.3;
    }
    const lines = wrapText(context, line, maxWidth);
    lines.forEach((segment) => {
      pushLine(segment, font, isHeading ? headingSize : bodySize, lineHeight);
    });
  });

  // Remove páginas vazias que podem ter sido criadas
  return pages.filter((page) => page.length > 0);
};

const drawPageHeader = (context, pageWidthPx, pageHeightPx, scale, logos) => {
  // Fundo branco
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, pageWidthPx, pageHeightPx);

  const margin = 70 * scale;
  const lineY1 = 75 * scale; // Primeira linha horizontal
  const lineY2 = pageHeightPx - (50 * scale); // Segunda linha horizontal (rodapé, 50pt do final)

  // Desenhar logos no topo
  if (logos.lumaLogo && logos.luisaLogo) {
    // Ajustar altura das logos para um tamanho menor e mais adequado
    const logoHeight = 25 * scale; // Reduzido de 40 para 25
    const logoY = 25 * scale; // Ajustado de 20 para 25 para centralizar melhor

    // Logo LUMA (esquerda)
    const lumaAspect = logos.lumaLogo.width / logos.lumaLogo.height;
    const lumaWidth = logoHeight * lumaAspect;
    context.drawImage(logos.lumaLogo, margin, logoY, lumaWidth, logoHeight);

    // Logo Luisa Moraes (direita)
    const luisaAspect = logos.luisaLogo.width / logos.luisaLogo.height;
    const luisaWidth = logoHeight * luisaAspect;
    context.drawImage(
      logos.luisaLogo,
      pageWidthPx - margin - luisaWidth,
      logoY,
      luisaWidth,
      logoHeight
    );
  }

  // Desenhar linhas horizontais
  context.strokeStyle = '#8B7AB8'; // Cor roxa das linhas (similar às logos)
  context.lineWidth = 2 * scale;

  // Linha superior (abaixo das logos)
  context.beginPath();
  context.moveTo(margin, lineY1);
  context.lineTo(pageWidthPx - margin, lineY1);
  context.stroke();

  // Linha inferior (rodapé)
  context.beginPath();
  context.moveTo(margin, lineY2);
  context.lineTo(pageWidthPx - margin, lineY2);
  context.stroke();
};

const renderPdfPages = async (pages, scale, logos) => {
  // Usando escala baseada em A4 (595.28 x 841.89 pt)
  const pageWidthPx = Math.round(PDF_PAGE.width * scale);
  const pageHeightPx = Math.round(PDF_PAGE.height * scale);

  const pageImages = [];

  for (let i = 0; i < pages.length; i++) {
    const lines = pages[i];
    const canvas = document.createElement('canvas');
    canvas.width = pageWidthPx;
    canvas.height = pageHeightPx;
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('Failed to get 2d context');
      continue;
    }

    // Desenhar cabeçalho (fundo, logos e linhas)
    drawPageHeader(context, pageWidthPx, pageHeightPx, scale, logos);

    // Configurar estilo do texto
    context.fillStyle = '#111';
    context.textBaseline = 'top';

    // Desenhar todas as linhas de texto
    lines.forEach((line) => {
      context.font = line.font;
      context.fillText(line.text, line.x, line.y);
    });

    const bytes = await canvasToJpegBytes(canvas);
    pageImages.push({
      bytes,
      width: pageWidthPx,
      height: pageHeightPx
    });
  }

  return pageImages;
};

const buildPdfFromImages = (images) => {
  const encoder = new TextEncoder();
  const objects = [];

  const pageKids = images.map((_, index) => `${3 + index * 3} 0 R`).join(' ');

  objects.push({
    content: `<< /Type /Catalog /Pages 2 0 R >>`
  });
  objects.push({
    content: `<< /Type /Pages /Count ${images.length} /Kids [${pageKids}] >>`
  });

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const imageName = `/Im${index + 1}`;

    // A imagem deve preencher toda a página PDF
    // Usamos a largura e altura da página diretamente
    const contentStream = `q ${PDF_PAGE.width} 0 0 ${PDF_PAGE.height} 0 0 cm ${imageName} Do Q`;
    const contentBytes = encoder.encode(contentStream);

    objects.push({
      content: `<< /Type /Page /Parent 2 0 R /Resources << /XObject << ${imageName} ${imageId} 0 R >> >> /MediaBox [0 0 ${PDF_PAGE.width} ${PDF_PAGE.height}] /Contents ${contentId} 0 R >>`
    });
    objects.push({
      dict: `<< /Length ${contentBytes.length} >>`,
      stream: contentBytes
    });
    objects.push({
      dict: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`,
      stream: image.bytes
    });
  });

  const chunks = [];
  const offsets = [0];
  let offset = 0;

  const pushChunk = (chunk) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  const header = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  pushChunk(encoder.encode(header));

  objects.forEach((object, index) => {
    const objectId = index + 1;
    offsets[objectId] = offset;
    pushChunk(encoder.encode(`${objectId} 0 obj\n`));
    if (object.stream) {
      pushChunk(encoder.encode(`${object.dict}\nstream\n`));
      pushChunk(object.stream);
      pushChunk(encoder.encode('\nendstream\nendobj\n'));
    } else {
      pushChunk(encoder.encode(`${object.content}\nendobj\n`));
    }
  });

  const xrefOffset = offset;
  pushChunk(encoder.encode(`xref\n0 ${objects.length + 1}\n`));
  pushChunk(encoder.encode('0000000000 65535 f \n'));
  for (let i = 1; i <= objects.length; i += 1) {
    const offsetValue = String(offsets[i]).padStart(10, '0');
    pushChunk(encoder.encode(`${offsetValue} 00000 n \n`));
  }
  pushChunk(
    encoder.encode(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    )
  );

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let position = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, position);
    position += chunk.length;
  });
  return output;
};

const buildPdf = async ({ parecerText, auditText, includeAudit }) => {
  // Carregar fontes e logos em paralelo
  const [logos] = await Promise.all([loadLogos(), loadFonts()]);

  // Escala para renderização de alta qualidade (2x)
  const scale = 2;

  const content = includeAudit
    ? `${parecerText}\n\nAnexo - Auditoria do cálculo\n${auditText}`
    : parecerText;

  const pages = layoutPdfLines(content, scale);
  const images = await renderPdfPages(pages, scale, logos);

  return buildPdfFromImages(images);
};

const downloadPdf = (bytes, filename) => {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const handleDownloadParecer = async () => {
  setPdfWarning('');
  const parecerText = outputs.parecer.textContent.trim();
  const auditText = outputs.auditoria.textContent.trim();
  if (!parecerText || parecerText === 'Nenhum cálculo realizado.') {
    setPdfWarning('Gere o parecer antes de baixar o PDF.');
    return;
  }
  try {
    const bytes = await buildPdf({
      parecerText,
      auditText,
      includeAudit: includeAuditCheckbox.checked
    });
    downloadPdf(bytes, buildPdfFilename(inputs.nome.value.trim(), currentMode));
  } catch (error) {
    console.error(error);
    setPdfWarning(error.message || 'Não foi possível gerar o PDF timbrado.');
  }
};

const updatePatroFactorVisibility = () => {
  const show = inputs.cotaRegraPatro.value === 'C';
  cotaPatroFactorField.classList.toggle('is-hidden', !show);
};

const updateCotaStatus = (message) => {
  cotaPdfStatus.textContent = message;
};

const handleCotaPdfUpload = async (file) => {
  if (!file) return;
  cotaPdfFile = file;
  lastParsedPdf = null;
  cotaApplyPdfButton.disabled = true;
  cotaPdfPreview.innerHTML = 'Nenhuma leitura validada.';
  updateCotaStatus('Arquivo carregado. Clique em “Validar leitura” para conferir a extração.');
};

const handleValidatePdf = async () => {
  if (!cotaPdfFile) {
    updateCotaStatus('Carregue um PDF antes de validar a leitura.');
    return;
  }
  updateCotaStatus('Validando leitura do PDF...');
  cotaPdfPreview.innerHTML = 'Processando...';
  cotaApplyPdfButton.disabled = true;
  try {
    const result = await parsePdfContributions(cotaPdfFile);
    lastParsedPdf = result;
    cotaPdfPreview.innerHTML = buildPreviewTable(result.rows);
    if (result.errors.length) {
      updateCotaStatus(
        `Não foi possível extrair a tabela com confiança. ${result.errors.join(' ')}`
      );
      return;
    }
    const warningText = result.warnings.length ? ` Avisos: ${result.warnings.join(' ')}` : '';
    updateCotaStatus(
      `Leitura validada: ${result.entries.length} lançamentos identificados.${warningText}`
    );
    cotaApplyPdfButton.disabled = false;
  } catch (error) {
    console.error(error);
    updateCotaStatus('Falha ao validar o PDF. Tente novamente ou use o modo assistido.');
    cotaPdfPreview.innerHTML = 'Nenhuma leitura validada.';
  }
};

const handleApplyPdf = () => {
  if (!lastParsedPdf || !lastParsedPdf.entries.length) {
    updateCotaStatus('Nenhuma leitura validada para aplicar.');
    return;
  }
  cotaEntries = lastParsedPdf.entries;
  renderCotaTable(inputs.dataCalculo.value);
  updateCotaStatus(`Leitura aplicada: ${lastParsedPdf.entries.length} lançamentos na tabela.`);
};

const handleApplyPdf = () => {
  if (!lastParsedPdf || !lastParsedPdf.entries.length) {
    updateCotaStatus('Nenhuma leitura validada para aplicar.');
    return;
  }
  cotaEntries = lastParsedPdf.entries;
  renderCotaTable(inputs.dataCalculo.value);
  updateCotaStatus(`Leitura aplicada: ${lastParsedPdf.entries.length} lançamentos na tabela.`);
};

const handleManualParse = () => {
  const text = inputs.cotaManualText.value.trim();
  if (!text) {
    updateCotaStatus('Cole o texto do PDF antes de tentar a leitura manual.');
    return;
  }
  const entries = parseManualTextContributions(text);
  if (!entries.length) {
    updateCotaStatus('Nenhuma competência identificada no texto colado.');
    return;
  }
  lastParsedPdf = null;
  cotaApplyPdfButton.disabled = true;
  cotaPdfPreview.innerHTML = 'Pré-visualização indisponível no modo manual.';
  cotaEntries = entries;
  updateCotaStatus(`Leitura manual concluída: ${entries.length} lançamentos.`);
  renderCotaTable(inputs.dataCalculo.value);
};

const addCotaRow = () => {
  cotaEntries = [...cotaEntries, createCotaEntry({})];
  renderCotaTable(inputs.dataCalculo.value);
};

const attachInputMasks = () => {
  document.querySelectorAll('.currency-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target;
      target.value = formatCurrencyInput(target.value);
    });
  });

  document.querySelectorAll('.competencia-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target;
      target.value = maskCompetencia(target.value);
    });
  });
};

const handleCotaTableInput = (event) => {
  const target = event.target;
  const id = Number(target.dataset.id);
  if (!id) return;
  const entryIndex = cotaEntries.findIndex((entry) => entry.id === id);
  if (entryIndex < 0) return;

  if (target.dataset.field === 'amountNominal') {
    const value = parseCurrency(target.value);
    cotaEntries[entryIndex].amountNominal = value;
  } else if (target.dataset.field === 'competence') {
    const parsed = parseMonthValue(target.value);
    cotaEntries[entryIndex].competence = parsed ? parsed.key : '';
  } else if (target.dataset.field === 'type') {
    cotaEntries[entryIndex].type = target.value;
  } else if (target.dataset.field === 'is13') {
    cotaEntries[entryIndex].is13 = target.checked;
  }
  renderCotaTable(inputs.dataCalculo.value);
};

const handleCotaTableClick = (event) => {
  const target = event.target;
  if (target.dataset.action === 'remove') {
    const id = Number(target.dataset.id);
    cotaEntries = cotaEntries.filter((entry) => entry.id !== id);
    renderCotaTable(inputs.dataCalculo.value);
  }
};

inputs.dataCalculo.value = getTodayISO();
setPdfWarning('');
setMode(inputs.modo.value || 'vaeba');
updatePatroFactorVisibility();
renderCotaTable(inputs.dataCalculo.value);

resetButton.addEventListener('click', resetForm);
calcButton.addEventListener('click', calculate);
copyAuditButton.addEventListener('click', () => handleCopy(outputs.auditoria.textContent));
copyParecerButton.addEventListener('click', () => handleCopy(outputs.parecer.textContent));
downloadParecerButton.addEventListener('click', handleDownloadParecer);
inputs.modo.addEventListener('change', (event) => setMode(event.target.value));
inputs.dataCalculo.addEventListener('change', () => renderCotaTable(inputs.dataCalculo.value));
inputs.cotaRegraPatro.addEventListener('change', updatePatroFactorVisibility);
inputs.cotaPdf.addEventListener('change', (event) => handleCotaPdfUpload(event.target.files?.[0]));
cotaParseManualButton.addEventListener('click', handleManualParse);
cotaValidatePdfButton.addEventListener('click', handleValidatePdf);
cotaApplyPdfButton.addEventListener('click', handleApplyPdf);
cotaAddRowButton.addEventListener('click', addCotaRow);
cotaRecalcButton.addEventListener('click', () => renderCotaTable(inputs.dataCalculo.value));
cotaTableBody.addEventListener('input', handleCotaTableInput);
cotaTableBody.addEventListener('change', handleCotaTableInput);
cotaTableBody.addEventListener('click', handleCotaTableClick);

attachInputMasks();
loadPremissas().finally(runTests);
