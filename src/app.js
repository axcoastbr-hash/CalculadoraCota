import { INPC_INDEX, INPC_RANGE } from './data/inpc.js';
import { QX_FEM, QX_MASC } from './data/mortality_at2000_suavizada.js';
const FALLBACK_INTEREST_RATES = {
  2021: 0.0437,
  2022: 0.0437,
  2023: 0.0437,
  2024: 0.0444
};

const NSUA = 13;
const FCB = 0.9818;
const OMEGA = 115;
const INPC_KEYS = Object.keys(INPC_INDEX).sort();
const YEAR_RANGE = {
  min: Number(INPC_RANGE.start.split('-')[0]),
  max: 2026
};
let interestRates = { ...FALLBACK_INTEREST_RATES };

const inputs = {
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
  ]
};

const outputs = {
  fatcor: document.getElementById('fatcor'),
  ax12: document.getElementById('ax12'),
  taxaI: document.getElementById('taxa-i'),
  supAjustado: document.getElementById('sup-ajustado'),
  vaebaBruta: document.getElementById('vaeba-bruta'),
  vaebaAjustada: document.getElementById('vaeba-ajustada'),
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

const getInpcIndex = (key, warnings, { allowFallback, label }) => {
  if (INPC_INDEX[key]) return INPC_INDEX[key];
  if (!allowFallback) {
    warnings.push(`Competência ${label} ${key} não encontrada na série INPC.`);
    return null;
  }
  const fallbackKey = getNearestInpcKey(key);
  if (fallbackKey) {
    warnings.push(
      `Competência ${label} ${key} fora da série. Usado INPC mais recente disponível (${fallbackKey}).`
    );
    return INPC_INDEX[fallbackKey];
  }
  warnings.push(`Competência ${label} ${key} não encontrada na série INPC.`);
  return null;
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
  const warnings = [];
  const inpcBase = competenciaBase
    ? getInpcIndex(competenciaBase.key, warnings, { allowFallback: false, label: 'base' })
    : null;
  const inpcFinal = competenciaFinal
    ? getInpcIndex(competenciaFinal.key, warnings, { allowFallback: true, label: 'final' })
    : null;
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

  outputs.tests.innerHTML = '';
  testItems.forEach((test) => {
    const li = document.createElement('li');
    li.className = `test-item ${test.pass ? '' : 'fail'}`;
    li.textContent = `${test.pass ? '✓' : '✗'} ${test.name}`;
    outputs.tests.appendChild(li);
  });
};

const renderAlerts = (warnings) => {
  outputs.alertas.innerHTML = '';
  warnings.forEach((warning) => {
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

const calculate = () => {
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

  const inpcBase = competenciaBase
    ? getInpcIndex(competenciaBase.key, warnings, { allowFallback: false, label: 'base' })
    : null;
  const inpcFinal = competenciaFinal
    ? getInpcIndex(competenciaFinal.key, warnings, { allowFallback: true, label: 'final' })
    : null;

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
  inputs.dataCalculo.value = getTodayISO();
  outputs.fatcor.textContent = '—';
  outputs.ax12.textContent = '—';
  outputs.taxaI.textContent = '—';
  outputs.supAjustado.textContent = '—';
  outputs.vaebaBruta.textContent = '—';
  outputs.vaebaAjustada.textContent = '—';
  outputs.alertas.innerHTML = '';
  outputs.auditoria.textContent = 'Nenhum cálculo realizado.';
  outputs.parecer.textContent = 'Nenhum cálculo realizado.';
  setPdfWarning('');
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

const buildPdfFilename = (name) => {
  const sanitized = (name || 'participante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `parecer_VAEBA_${sanitized || 'participante'}_${dateStamp}.pdf`;
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
    downloadPdf(bytes, buildPdfFilename(inputs.nome.value.trim()));
  } catch (error) {
    console.error(error);
    setPdfWarning(error.message || 'Não foi possível gerar o PDF timbrado.');
  }
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

inputs.dataCalculo.value = getTodayISO();
setPdfWarning('');

resetButton.addEventListener('click', resetForm);
calcButton.addEventListener('click', calculate);
copyAuditButton.addEventListener('click', () => handleCopy(outputs.auditoria.textContent));
copyParecerButton.addEventListener('click', () => handleCopy(outputs.parecer.textContent));
downloadParecerButton.addEventListener('click', handleDownloadParecer);

attachInputMasks();
loadPremissas().finally(runTests);
