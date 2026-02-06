# Calculadora VAEBA e COTA • PPSP-NR

Aplicação web para cálculo de VAEBA (Reserva Matemática Individual) e simulação de COTA patrimonial no plano PETROS PPSP-NR (Não Repactuados).

## Requisitos

- Navegador moderno (Chrome/Edge/Firefox).
- O modo VAEBA funciona offline. O modo COTA usa PDF.js via CDN para leitura de PDF (requer conexão no primeiro carregamento).
- Observação: as fontes `.woff/.woff2` não estão no repositório para facilitar a criação de PR. Para obter o visual final, adicione manualmente os arquivos em `src/assets/fonts/` e (após o build) em `dist/assets/fonts/`.
- Para gerar o PDF timbrado, coloque o arquivo `timbrado.png` em `src/assets/` (e, após o build, em `dist/assets/`). Para substituir o timbrado basta trocar esse arquivo mantendo o mesmo nome.

## Como rodar em desenvolvimento

Abra um servidor local apontando para a pasta `src`:

```bash
cd /workspace/CalculadoraCota
python -m http.server 5173 --directory src
```

Acesse: `http://localhost:5173`

## Como gerar o build offline

```bash
cd /workspace/CalculadoraCota
./build.sh
```

Isso copia os arquivos finais para a pasta `dist/`.

## Como abrir o build offline

- Opção 1: abrir diretamente `dist/index.html` no navegador.
- Opção 2: servir via servidor local simples:

```bash
cd /workspace/CalculadoraCota
python -m http.server 4173 --directory dist
```

Acesse: `http://localhost:4173`

## Estrutura de dados embutidos

- `src/data/inpc.js`: série INPC (1994-01 a 2025-11)
- `src/data/mortality_at2000_suavizada.js`: tábuas AT 2000 suavizadas (10%)
- `src/data/interestRates.js`: mapa editável de taxas anuais

## Como usar o modo COTA

1. No campo **Modo de cálculo**, selecione **COTA (Simulação de patrimônio individual)**.
2. Faça upload do PDF “Levantamento de Contribuições Normais e Joia”. O sistema tentará ler as competências e valores automaticamente.
3. Se a leitura automática falhar, cole o texto do PDF no campo “Modo assistido (colar texto)” e clique em **Tentar leitura do texto colado**.
4. Revise/ajuste a tabela de contribuições:
   - edite competência, tipo, valores e marque 13º quando aplicável;
   - use **Adicionar linha** para inserir contribuições manuais.
5. No card **Parâmetros da simulação**, defina:
   - data inicial (opcional);
   - regra da patrocinadora (A/B/C/D) e fator (se aplicável);
   - tipos de contribuição incluídos.
6. Clique em **Calcular** para gerar:
   - COTA total;
   - totais por tipo;
   - auditoria detalhada e parecer técnico resumido.

## Conversão pré-Real (COTA)

Valores anteriores a 1994-07 são convertidos para BRL utilizando a cadeia oficial de moedas até CR$ e a divisão final por 2.750 (URV). Competências anteriores a 1994-01 são corrigidas pelo INPC a partir de 1994-01 por limitação da série.

## Política INPC (COTA)

- Série embutida: 1994-01 a 2025-11.
- Competências anteriores a 1994-01 são ancoradas em 1994-01 (INPC base).
- Competência final acima do último mês da série é clampada para o último índice disponível.
- Os avisos são consolidados em bloco único na auditoria da COTA.

## Testes de sanidade

A seção **"Testes de Sanidade"** é visível no browser e executa automaticamente:

1. SUP ajustado com os valores de referência.
2. Validação de integridade do äx(12).
3. Coerência VAEBA_BRUTA > VAEBA_AJUSTADA.
4. Sanidade da escala da tábua AT-2000 suavizada.
5. Caso parecer (golden test) com checagem de äx(12) bruto/usado.
6. Sanidade da conversão pré-Real e capitalização da COTA.

## Correções do motor (parsing e fatores)

- **Causa identificada:** parsing de competência INPC aceitava entrada inválida e a seleção de taxa usava o ano do cálculo em vez do último exercício fechado; além disso, o FCB não estava embutido no äx(12).
- **Correção aplicada:** validação MM/AAAA com faixa de ano, fallback de INPC final para a última competência disponível, regra de juros por ano do cálculo - 1 (com override opcional), äx(12) bruto + aplicado (FCB) registrados na auditoria.
- **Garantias de não regressão:** testes de sanidade da escala do qx e o teste “caso parecer” verificam SUP ajustado, äx(12) bruto/usado e coerência dos resultados.
