const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 10 });

let inpcIndex = { ...INPC_INDEX };

const inputNome = document.getElementById("nome");
const inputSexo = document.getElementById("sexo");
const inputNascimento = document.getElementById("dataNascimento");
const inputCalculo = document.getElementById("dataCalculo");
const inputCompetencia = document.getElementById("competenciaBase");
const inputBeneficioBruto = document.getElementById("beneficioBruto");
const inputBeneficioLiquido = document.getElementById("beneficioLiquido");
const rubricaInputs = Array.from(document.querySelectorAll(".rubrica"));
const uploadInput = document.getElementById("inpcUpload");
const uploadStatus = document.getElementById("uploadStatus");

const btnCalcular = document.getElementById("calcular");
const btnLimpar = document.getElementById("limpar");
const btnCopiarAuditoria = document.getElementById("copiarAuditoria");
const btnCopiarParecer = document.getElementById("copiarParecer");

const outBruta = document.getElementById("vaebaBruta");
const outAjustada = document.getElementById("vaebaAjustada");
const outK = document.getElementById("fatorK");
const outAlerts = document.getElementById("alerts");
const auditoriaBox = document.getElementById("auditoria");
const parecerBox = document.getElementById("parecer");

function initDefaults() {
  const today = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  inputCalculo.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

initDefaults();

function toMoney(value) {
  if (!isFinite(value)) return "—";
  return currencyFormatter.format(value);
}

function toNumber(value) {
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value.replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return isNaN(num) ? Number.NaN : num;
}

function normalizeCompetencia(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const dashMatch = trimmed.match(/^(\d{4})[-/](\d{2})$/);
  const slashMatch = trimmed.match(/^(\d{2})[-/](\d{4})$/);
  if (dashMatch) {
    return `${dashMatch[1]}-${dashMatch[2]}`;
  }
  if (slashMatch) {
    return `${slashMatch[2]}-${slashMatch[1]}`;
  }
  return null;
}

function dateToCompetencia(dateStr) {
  const dt = new Date(dateStr);
  if (isNaN(dt)) return null;
  const pad = (n) => n.toString().padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
}

function computeAgeExact(birthStr, calcStr) {
  const birth = new Date(birthStr);
  const calc = new Date(calcStr);
  if (isNaN(birth) || isNaN(calc)) throw new Error("Datas inválidas");
  if (calc < birth) throw new Error("Data do cálculo anterior à data de nascimento.");
  const diffMs = calc - birth;
  const ageYears = diffMs / (1000 * 60 * 60 * 24 * 365.2425);
  return ageYears;
}

function getAx12(sexo, idadeExata) {
  if (idadeExata < 0) throw new Error("Idade negativa não é permitida.");
  const table = sexo === "fem" ? ax12_fem_precomputed : ax12_masc_precomputed;
  let x0 = Math.floor(idadeExata);
  let f = idadeExata - x0;
  if (x0 >= OMEGA) {
    x0 = OMEGA;
    f = 0;
  }
  const ax0 = table[Math.min(x0, table.length - 1)];
  const ax1 = table[Math.min(x0 + 1, table.length - 1)];
  const interp = ax0 + f * (ax1 - ax0);
  return { x0, f, ax0, ax1, ax12: interp };
}

function computeFatcor(baseComp, finalComp) {
  if (!inpcIndex[baseComp]) throw new Error("Competência fora do intervalo do INPC embutido.");
  if (!inpcIndex[finalComp]) throw new Error("Competência final fora do intervalo do INPC embutido.");
  if (finalComp < baseComp) throw new Error("Data do cálculo deve ser posterior ou igual à competência base.");
  const idxBase = inpcIndex[baseComp];
  const idxFinal = inpcIndex[finalComp];
  const fatcor = idxFinal / idxBase;
  return { fatcor, idxBase, idxFinal };
}

function somaRubricas() {
  return rubricaInputs.reduce((acc, input) => {
    const val = toNumber(input.value || "0");
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
}

function clearAlerts() {
  outAlerts.innerHTML = "";
}

function pushAlert(msg, type = "warn") {
  const div = document.createElement("div");
  div.className = `alert ${type === "error" ? "error" : ""}`;
  div.textContent = msg;
  outAlerts.appendChild(div);
}

function fillAuditoria(data) {
  const lines = [];
  lines.push("=== Entradas do Participante ===");
  lines.push(`Nome: ${data.nome || "(não informado)"}`);
  lines.push(`Sexo: ${data.sexo === "fem" ? "Feminino" : "Masculino"}`);
  lines.push(`Data de nascimento: ${data.dn}`);
  lines.push(`Data do cálculo: ${data.dc}`);
  lines.push(`Idade exata: ${data.idadeExata.toFixed(4)} anos (x0=${data.ax.x0}, f=${data.ax.f.toFixed(4)})`);
  lines.push(`Competência base: ${data.competenciaBase}`);
  lines.push("=== Benefício e Rubricas ===");
  lines.push(`Benefício bruto: ${toMoney(data.beneficioBruto)}`);
  lines.push(`Rubricas: CONT. PETROS=${toMoney(data.rubricas.contPetros)}, PARC. DÉBITO PED PPSP=${toMoney(data.rubricas.parcDebito)}, CONT. EXTRAORD. PPSP=${toMoney(data.rubricas.extraPPSP)}, CONT. EXTRAORD. PPSP NR=${toMoney(data.rubricas.extraPPSPNR)}, PECÚLIO=${toMoney(data.rubricas.peculio)}`);
  lines.push(`Total rubricas: ${toMoney(data.totalRubricas)}`);
  lines.push(`SUP ajustado: ${toMoney(data.supAjustado)}`);
  if (data.beneficioLiquidoInformado !== null) {
    lines.push(`Benefício líquido informado: ${toMoney(data.beneficioLiquidoInformado)}`);
    lines.push(`Benefício líquido estimado: ${toMoney(data.beneficioLiquidoEstimado)} (diferença ${toMoney(data.divergenciaLiquido)})`);
  }
  lines.push("=== Premissas Fixas ===");
  lines.push("NSUA = 13; FCB = 0,9818; i = 4,44% a.a.; crescimento real = 0%; mortalidade: IBGE 2024 qx por sexo; FATCOR via INPC embutido");
  lines.push("=== Cálculo do INPC (FATCOR) ===");
  lines.push(`Competência final: ${data.competenciaFinal}`);
  lines.push(`Índice base: ${data.inpc.idxBase.toFixed(6)} | Índice final: ${data.inpc.idxFinal.toFixed(6)}`);
  lines.push(`FATCOR = ${numberFormatter.format(data.inpc.fatcor)}`);
  lines.push("=== Cálculo do äx(12) ===");
  lines.push(`ax[x0]=${numberFormatter.format(data.ax.ax0)}, ax[x0+1]=${numberFormatter.format(data.ax.ax1)}, interpolado=${numberFormatter.format(data.ax.ax12)}`);
  lines.push("=== Fórmula e Resultados ===");
  lines.push(`K = NSUA × äx(12) × FCB × FATCOR = ${numberFormatter.format(data.k)}`);
  lines.push(`VAEBA BRUTA = ${toMoney(data.vaebaBruta)}`);
  lines.push(`VAEBA AJUSTADA = ${toMoney(data.vaebaAjustada)}`);
  auditoriaBox.value = lines.join("\n");
}

function buildParecer(data, alertas) {
  const bullet = (label, value) => `${label}: ${value}`;
  const linhas = [];
  linhas.push("PARECER TÉCNICO RESUMIDO — CÁLCULO DE RESERVA MATEMÁTICA INDIVIDUAL (VAEBA) — PPSP-NR");
  linhas.push("");
  linhas.push("1. OBJETIVO");
  linhas.push("Apurar a reserva matemática individual (VAEBA) do participante no PPSP-NR com base nos dados informados e nas premissas atuariais fixas do plano.");
  linhas.push("");
  linhas.push("2. METODOLOGIA E PREMISSAS");
  linhas.push("- NSUA = 13 suplementações anuais; FCB = 0,9818; taxa real i = 4,44% a.a.; crescimento real do benefício = 0%.");
  linhas.push("- Mortalidade: tábua IBGE 2024 por sexo (ω=90; q90=1,0).");
  linhas.push("- Correção monetária: INPC embutido; FATCOR = índice(final)/índice(base).");
  linhas.push("- Fator atuarial äx(12) obtido por funções de comutação (l0=10.000.000, v=1/(1+i), Dx, Nx) com aproximação de Woolhouse (-11/24) e interpolação pela idade exata.");
  linhas.push("- Fórmula: VAEBA = NSUA × SUP × äx(12) × FCB × FATCOR.");
  linhas.push("");
  linhas.push("3. DADOS DE ENTRADA");
  linhas.push(`- Identificação: ${data.nome || "(não informado)"}, sexo ${data.sexo === "fem" ? "feminino" : "masculino"}, DN ${data.dn}, idade exata ${data.idadeExata.toFixed(4)} anos na data do cálculo.`);
  linhas.push(`- Data do cálculo: ${data.dc}; competência base: ${data.competenciaBase}.`);
  linhas.push(`- Benefício bruto informado: ${toMoney(data.beneficioBruto)}.`);
  linhas.push(`- Rubricas: CONT. PETROS ${toMoney(data.rubricas.contPetros)}; PARC. DÉBITO PED PPSP ${toMoney(data.rubricas.parcDebito)}; CONT. EXTRAORD. PPSP ${toMoney(data.rubricas.extraPPSP)}; CONT. EXTRAORD. PPSP NR ${toMoney(data.rubricas.extraPPSPNR)}; PECÚLIO ${toMoney(data.rubricas.peculio)}. Total = ${toMoney(data.totalRubricas)}.`);
  linhas.push(`- SUP ajustado = ${toMoney(data.supAjustado)}.`);
  if (data.beneficioLiquidoInformado !== null) {
    const divergenciaMsg = Math.abs(data.divergenciaLiquido) > 1 ? ` (divergência ${toMoney(data.divergenciaLiquido)})` : "";
    linhas.push(`- Benefício líquido informado: ${toMoney(data.beneficioLiquidoInformado)}${divergenciaMsg}.`);
  }
  linhas.push("");
  linhas.push("4. APURAÇÃO DOS FATORES");
  linhas.push(`- äx(12) interpolado: ${numberFormatter.format(data.ax.ax12)} (x0=${data.ax.x0}, f=${data.ax.f.toFixed(4)}).`);
  linhas.push(`- INPC: base ${data.competenciaBase} (índice ${data.inpc.idxBase.toFixed(6)}); final ${data.competenciaFinal} (índice ${data.inpc.idxFinal.toFixed(6)}); FATCOR = ${numberFormatter.format(data.inpc.fatcor)}.`);
  linhas.push(`- Fator K = NSUA × äx(12) × FCB × FATCOR = ${numberFormatter.format(data.k)}.`);
  linhas.push("");
  linhas.push("5. RESULTADOS");
  linhas.push(`- VAEBA BRUTA: ${toMoney(data.vaebaBruta)}.`);
  linhas.push(`- VAEBA AJUSTADA: ${toMoney(data.vaebaAjustada)}.`);
  if (alertas.length) {
    alertas.forEach((a) => linhas.push(`- Alerta: ${a}`));
  }
  linhas.push("");
  linhas.push("6. CONSIDERAÇÕES FINAIS");
  linhas.push("Cálculo estimativo offline com base na tábua IBGE 2024 (ω=90) e série INPC embutida (1994-01 a 2025-11), considerando premissas atuariais fixas do PPSP-NR.");
  linhas.push("Fatores e valores reproduzíveis mediante repetição das mesmas entradas. Recomenda-se auditoria complementar caso novos dados sejam apresentados.");
  parecerBox.value = linhas.join("\n");
}

function compute() {
  clearAlerts();
  const alertas = [];
  try {
    const nome = inputNome.value.trim();
    const sexo = inputSexo.value;
    const dn = inputNascimento.value;
    const dc = inputCalculo.value;
    const competenciaBaseRaw = inputCompetencia.value;
    const competenciaBase = normalizeCompetencia(competenciaBaseRaw);
    const competenciaFinal = dateToCompetencia(dc);
    const beneficioBruto = toNumber(inputBeneficioBruto.value);
    const beneficioLiquidoInformado = inputBeneficioLiquido.value.trim() ? toNumber(inputBeneficioLiquido.value) : null;

    if (!dn || !dc || !competenciaBase) throw new Error("Preencha data de nascimento, data do cálculo e competência base.");
    if (isNaN(beneficioBruto)) throw new Error("Benefício bruto inválido.");

    const idadeExata = computeAgeExact(dn, dc);
    const ax = getAx12(sexo, idadeExata);

    const inpc = computeFatcor(competenciaBase, competenciaFinal);
    const fatcor = inpc.fatcor;

    const rubricas = rubricaInputs.reduce((acc, input) => {
      const key = input.dataset.key;
      const val = toNumber(input.value || "0");
      acc[key] = isNaN(val) ? 0 : val;
      return acc;
    }, {});
    const totalRubricas = somaRubricas();
    const supAjustado = beneficioBruto - totalRubricas;

    let divergenciaLiquido = 0;
    if (beneficioLiquidoInformado !== null) {
      const estimado = beneficioBruto - totalRubricas;
      divergenciaLiquido = beneficioLiquidoInformado - estimado;
      if (Math.abs(divergenciaLiquido) > 1) {
        const msg = `Divergência entre líquido informado e estimado: ${toMoney(divergenciaLiquido)}.`;
        pushAlert(msg, "warn");
        alertas.push(msg);
      }
    }

    const ax12 = ax.ax12;
    const k = NSUA * ax12 * FCB * fatcor;
    const vaebaBruta = NSUA * beneficioBruto * ax12 * FCB * fatcor;
    const vaebaAjustada = NSUA * supAjustado * ax12 * FCB * fatcor;

    outBruta.textContent = toMoney(vaebaBruta);
    outAjustada.textContent = toMoney(vaebaAjustada);
    outK.textContent = numberFormatter.format(k);

    const data = {
      nome,
      sexo,
      dn,
      dc,
      competenciaBase,
      competenciaFinal,
      beneficioBruto,
      beneficioLiquidoInformado,
      beneficioLiquidoEstimado: beneficioBruto - totalRubricas,
      divergenciaLiquido,
      rubricas,
      totalRubricas,
      supAjustado,
      inpc,
      idadeExata,
      ax,
      k,
      vaebaBruta,
      vaebaAjustada,
    };

    fillAuditoria(data);
    buildParecer(data, alertas);
  } catch (err) {
    pushAlert(err.message, "error");
    outBruta.textContent = outAjustada.textContent = outK.textContent = "—";
    auditoriaBox.value = "";
    parecerBox.value = "";
  }
}

function limpar() {
  inputNome.value = "";
  inputSexo.value = "masc";
  inputNascimento.value = "";
  inputCompetencia.value = "";
  inputBeneficioBruto.value = "";
  inputBeneficioLiquido.value = "";
  rubricaInputs.forEach((r) => (r.value = ""));
  initDefaults();
  outBruta.textContent = outAjustada.textContent = outK.textContent = "—";
  auditoriaBox.value = "";
  parecerBox.value = "";
  clearAlerts();
}

async function copiar(target, label) {
  if (!target.value) return;
  await navigator.clipboard.writeText(target.value);
  const prev = label.textContent;
  label.textContent = "Copiado!";
  setTimeout(() => (label.textContent = prev), 1200);
}

async function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const name = file.name.toLowerCase();
  try {
    const text = await file.text();
    if (name.endsWith(".json")) {
      const parsed = JSON.parse(text);
      inpcIndex = { ...parsed };
      uploadStatus.textContent = `INPC carregado com ${Object.keys(inpcIndex).length} competências (JSON).`;
    } else if (name.endsWith(".csv")) {
      const lines = text.split(/\r?\n/).filter(Boolean);
      const map = {};
      lines.forEach((line) => {
        const [comp, idx] = line.split(/;|,/);
        const norm = comp?.trim();
        const val = Number(idx?.trim().replace(/,/g, "."));
        if (norm && !isNaN(val)) map[norm] = val;
      });
      inpcIndex = map;
      uploadStatus.textContent = `INPC carregado com ${Object.keys(inpcIndex).length} competências (CSV).`;
    } else {
      uploadStatus.textContent = "Formato não suportado. Converta para CSV ou JSON simples.";
    }
  } catch (e) {
    uploadStatus.textContent = `Erro ao ler arquivo: ${e.message}`;
  }
}

btnCalcular.addEventListener("click", compute);
btnLimpar.addEventListener("click", limpar);
btnCopiarAuditoria.addEventListener("click", () => copiar(auditoriaBox, btnCopiarAuditoria));
btnCopiarParecer.addEventListener("click", () => copiar(parecerBox, btnCopiarParecer));
uploadInput.addEventListener("change", handleUpload);

// Sanidade de dados INPC para informação de auditoria
(function sanityCheckINPC() {
  const base = "2024-01";
  const final = "2025-11";
  if (inpcIndex[base] && inpcIndex[final]) {
    const fat = inpcIndex[final] / inpcIndex[base];
    if (Math.abs(fat - INPC_SANITY_TARGET) > 0.05) {
      uploadStatus.textContent = `Aviso: FATCOR(2024-01→2025-11) = ${fat.toFixed(6)} (referência ${INPC_SANITY_TARGET}). Série foi saneada.`;
    }
  }
})();
