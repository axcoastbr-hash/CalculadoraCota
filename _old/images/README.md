# Calculadora Atuarial VAEBA – PPSP-NR

Ferramenta web para cálculo da reserva matemática individual (VAEBA) do plano PPSP-NR (Não Repactuados) da PETROS.

## Visão Geral

Esta aplicação standalone permite calcular o Valor Atual dos Encargos com Benefícios Atuais (VAEBA) de forma automatizada, extraindo dados diretamente de documentos PDF e aplicando os parâmetros atuariais do plano PPSP-NR.

### Características Principais

- **100% Client-side**: Processa todos os dados localmente no navegador, sem envio de informações sensíveis
- **Extração Automática de PDFs**: Lê e interpreta automaticamente contracheques, extratos de contribuição e estudos atuariais
- **Conversão Histórica de Moedas**: Converte contribuições de moedas históricas brasileiras (Cr$, Cz$, NCz$, CR$) para Real (R$)
- **Parâmetros Atuariais Editáveis**: Permite ajuste fino dos fatores utilizados no cálculo
- **Auditoria Completa**: Gera relatório textual detalhado de todo o processo de cálculo

## Fórmula de Cálculo

```
VAEBA = NSUA × SUP × äₓ(12) × FCB × FATCOR
```

Onde:
- **NSUA**: Número de suplementações anuais (padrão: 13)
- **SUP**: Suplementação PETROS (bruta ou líquida)
- **äₓ(12)**: Fator de renda vitalícia subanual (padrão: 15,74683)
- **FCB**: Fator de capacidade dos benefícios (padrão: 0,9818)
- **FATCOR**: Fator de atualização monetária (padrão: 1,0037)

## Tecnologias Utilizadas

- **HTML5 + CSS3**: Interface responsiva com design moderno
- **JavaScript ES5+**: Lógica de processamento e cálculos
- **[pdf.js](https://mozilla.github.io/pdf.js/)**: Biblioteca Mozilla para leitura de PDFs (via CDN)
- **Google Fonts**: Tipografia Alegreya Sans

## Como Usar

### 1. Abrir a Aplicação

Basta abrir o arquivo `ProtCalculadoraReserva.html` em qualquer navegador moderno (Chrome, Firefox, Edge, Safari).

### 2. Preencher Dados Básicos

- Selecione o plano (PPSP-NR)
- Informe a data-base do cálculo
- Preencha idade e sexo do participante

### 3. Upload de Documentos (Opcional mas Recomendado)

A aplicação extrai automaticamente informações dos seguintes PDFs:

#### Contracheque PETROS
- Identifica o nome do participante
- Extrai o benefício bruto (TOTAL DOS PROVENTOS PETROS)

#### Extrato de Contribuição
- Lê contribuições históricas mês a mês
- Converte moedas antigas para Real automaticamente
- Soma todas as contribuições (normais + extraordinárias + PED + pecúlio)

#### Cálculo de Concessão/Estudo Atuarial
- Identifica äₓ(12)
- Extrai FCB e FATCOR se disponíveis

#### Declaração de IR
- Identifica nome completo do contribuinte

**Importante**: Os PDFs devem estar em formato pesquisável (com texto). PDFs escaneados apenas como imagem precisam de OCR prévio.

### 4. Ajustar Parâmetros Atuariais (Seção Avançada)

Clique em "SEÇÃO AVANÇADA" para editar:
- NSUA, äₓ(12), FCB, FATCOR
- Taxa de juros real
- Tábua de mortalidade
- Indexador de reajuste

### 5. Calcular

Clique no botão **"CALCULAR VAEBA"** para gerar:
- VAEBA líquida e bruta
- Fator global K
- SUP líquida
- Relatório de auditoria completo

## Conversão de Moedas Históricas

O sistema converte automaticamente contribuições em moedas antigas:

| Moeda | Período | Fator de Conversão para R$ |
|-------|---------|---------------------------|
| Cruzeiro (Cr$) | 1970-1984 | 1 / 2.750.000.000 |
| Cruzeiro (Cr$) | 1984-1986 | 1 / 2.750.000 |
| Cruzado (Cz$) | 1986-1989 | 1 / 2.750.000 |
| Cruzado Novo (NCz$) | 1989-1990 | 1 / 2.750.000 |
| Cruzeiro (Cr$) | 1990-1993 | 1 / 2.750.000 |
| Cruzeiro Real (CR$) | 1993-1994 | 1 / 2.750 |
| Real (R$) | 1994-atual | 1 |

## Requisitos

- Navegador moderno com suporte a JavaScript ES5+
- Conexão à internet (apenas para carregar pdf.js e fontes via CDN)
- PDFs em formato pesquisável (com texto extraível)

## Estrutura de Arquivos

```
.
├── ProtCalculadoraReserva.html    # Aplicação principal (arquivo único)
├── logo-luma.png                   # Logotipo LUMA (referenciado no HTML)
└── README.md                       # Este arquivo
```

## Parâmetros Padrão PPSP-NR

```javascript
NSUA: 13
äₓ(12): 15,74683
FCB: 0,9818
FATCOR: 1,0037
Taxa Real: 4,37% a.a.
Tábua: Experiência Petros 2025 (geral) / AT-83 inválidos
Indexador: IPCA (IBGE)
```

## Resultados Parciais

Se FCB ou FATCOR não forem informados ou estiverem inválidos, o sistema:
- Assume valor 1,00 para os parâmetros ausentes
- Marca o resultado como **RESULTADO PARCIAL**
- Destaca visualmente com badge de aviso
- Registra a observação na auditoria

## Limitações e Observações

- **PDFs Escaneados**: Arquivos apenas em imagem não podem ser lidos. É necessário OCR prévio.
- **Precisão de Extração**: A identificação automática de valores depende do padrão dos documentos. Sempre revise os campos preenchidos.
- **Privacidade**: Todos os dados são processados localmente. Nenhuma informação é enviada para servidores externos.
- **Conversão de Moedas**: Os fatores de conversão são aproximados para fins de somatório histórico.

## Solução de Problemas

### "Este PDF parece ser apenas imagem"
- O arquivo está escaneado sem OCR
- Solução: Use software de OCR ou obtenha versão pesquisável do documento

### "Não foi possível identificar o benefício bruto"
- O padrão do contracheque pode ser diferente
- Solução: Preencha o campo manualmente

### Valores Incorretos Extraídos
- A formatação do PDF pode ter confundido a leitura
- Solução: Verifique e corrija os campos antes de calcular

## Segurança e Privacidade

- Sem dependências de backend
- Sem cookies ou tracking
- Sem envio de dados para servidores
- Processamento 100% local no navegador
- Bibliotecas externas carregadas apenas de CDNs oficiais (Mozilla, Google)

## Suporte

Para dúvidas ou problemas, consulte a documentação técnica do plano PPSP-NR ou entre em contato com o departamento atuarial.

## Licença

Uso interno – Ferramenta para cálculo de reserva matemática (VAEBA) do PPSP-NR.

---

**Versão**: 1.0
**Última atualização**: Dezembro 2025
**Desenvolvido para**: LUMA – Luísa Moraes Advogados
