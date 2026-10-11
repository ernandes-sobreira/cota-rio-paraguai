# Auditoria da V2.3 — 11/10/2026

## Resultado

As cotas atuais foram conferidas na [tabela oficial CHN-6](https://www.marinha.mil.br/chn-6/): Cáceres 1,15 m, Ladário 1,22 m e Porto Murtinho 2,87 m, todas com data 11/10/2026. Variações publicadas: +0,08, +0,02 e −0,02 m. A tabela não informa a hora da medição. A verificação pública e a primeira coleta do registro têm horários separados no feed.

A base antiga de 65.257 registros NÃO pôde ser certificada como uma série de observações da Marinha. Foram encontradas sequências exatamente iguais entre Cáceres e Porto Murtinho durante 01/08–31/10 (92 dias) de 2022, 2023, 2024 e 2025. Há também diferenças extensas em relação aos valores recuperados do serviço oficial ANA. Isso é evidência de inconsistência que requer revisão da preparação original; não demonstra, por si só, fabricação intencional ou qual operação produziu a divergência.

O arquivo original `rio_paraguai_estacoes_cota_diaria.csv` permanece intacto, com SHA-256 `55e8b8112054fe75856289b41583c0f840b1f322791c6ae432fc025aead3deb1`. Os gráficos, estatísticas e comparações da V2.3 usam **data/history-ana.csv**, uma recuperação independente do serviço oficial ANA. A versão anterior arquivada não é a referência vigente.

| Estação | Dias usados da ANA | Datas em comum com a base antiga | Valores divergentes nessas datas |
| --- | ---: | ---: | ---: |
| Cáceres | 21,234 | 21,083 | 17,038 |
| Ladário | 20,460 | 20,131 | 8,492 |
| Porto Murtinho | 21,731 | 21,723 | 21,678 |

Diferença comparada com tolerância de 0,000001 m. A base nova contém 63.425 registros; menor contagem não significa preenchimento ou exclusão arbitrária de valores diferentes.

## Recuperação e seleção

Serviço: https://telemetriaws1.ana.gov.br/ServiceANA.asmx?op=HidroSerieHistorica

Códigos: Cáceres 66070004; Ladário 66825000; Porto Murtinho 67100000. Janela: 01/01/1966 a 31/12/2025. `tipoDados=1`, `nivelConsistencia=1` (bruto na documentação atual do endpoint; não rotulado como consistido). Foram usados exclusivamente registros `MediaDiaria=1`. As leituras de 07h e 17h não são somadas nem promediadas novamente com a média diária.

- Cota original em cm, dividida por 100 para m; zeros e negativos preservados.
- Campo diário vazio permanece ausente; não há interpolação.
- Status diário explícito diferente de 1 foi excluído conservadoramente: 57 dias em Cáceres, 118 em Ladário e 141 em Porto Murtinho. O parser não atribui significado não documentado aos códigos 2/3.
- Status ausente permanece desconhecido: não foi convertido para "validado". Contagens por estação no manifesto. Recuperação da fonte não certifica homogeneidade, datum, qualidade de cada observação nem mudanças de instrumentos.
- Respostas completas, incluindo os registros excluídos, em `data/snapshots/ana-history-2026-10-11.tar.gz`. URLs, momento da recuperação e SHA-256 em `data/history-provenance.json`.
- Exemplo 11/10/2025: médias diárias oficiais ANA de **0,680 m** (Cáceres), **1,245 m** (Ladário) e **2,375 m** (Porto Murtinho). Os dados antigos eram 1,446666… m, 1,830 m e 1,446666… m.

## Comparações na interface

A diferença usa a última leitura Marinha menos o valor no mesmo dia/mês do ano anterior. Para 2025, a referência é a média diária ANA recuperada. Quando houver uma leitura Marinha no arquivo incremental para o ano anterior, ela terá prioridade e será identificada como tal. Ausência exata, inclusive 29/02, não usa dia vizinho. As médias de 2026 da telemetria não são substitutos silenciosos para a leitura Marinha.

A posição é um percentil empírico: **100 × número de cotas menores ou iguais à leitura / número de cotas da estação na base histórica**. Usa todos os dias elegíveis disponíveis em 1966–2025, sem ponderar anos nem incluir o ponto atual. Empates entram no numerador. A interface também apresenta, nos detalhes, a posição somente entre os mesmos dias do calendário em anos anteriores. Base completa significa este recorte recuperado, não toda observação já feita na estação.

A comparação é **numérica e descritiva**: leitura pontual atual e média diária histórica diferem em protocolo. A continuidade do zero e local da régua ainda não foi verificada, especialmente em Cáceres, onde a Marinha informa Ponte Marechal Rondon. Os resultados não são anomalias hidrológicas certificadas, recordes oficiais ou alertas de risco.

## Automação e falhas

- GitHub Actions: 07h20, 08h20, 10h20 e 14h20 (MT, UTC−4), com coleta independente de ANA e Marinha. Horários previstos, sujeitos ao escalonamento do GitHub.
- Marinha direta: HTTP 403 observado. Esse caminho não foi apresentado como funcionando. A leitura pública verificada é o complemento autorizado; nenhuma barreira é contornada.
- Tarefa complementar ChatGPT encontrada ativa: 08h e 14h, início configurado em 12/10/2026. Depende da tarefa ativa, fonte acessível e conexão GitHub. Ainda sem execução agendada concluída no momento da auditoria.
- ANA: coletor preserva a última cópia quando todas as consultas falham, registra tentativa/erro e sinaliza falha parcial com código de saída não zero. Datas e horários são os da fonte; fuso da observação ANA não é declarado no XML.
- Marinha: parser rejeita célula numérica ambígua, data futura e tabela incompleta. Reconsultas idênticas preservam a primeira coleta; `last_success_at` indica a última verificação.
- Atualizações são incrementais. Arquivo JSON público é do projeto, não uma API oficial da Marinha. Consulta do navegador não equivale a nova medição nem nova coleta na origem.

## Reprodução

```sh
# Extrair o pacote de respostas em .cache/history-source/
python scripts/recover_history.py --offline
python scripts/build_stats.py
npm run build
python -m unittest discover -s tests -v
node --test tests/*.test.js
```

Os testes reproduzem todos os 63.425 registros históricos publicados no painel a partir dos XMLs arquivados e conferem os agregados iniciais de 2026 contra os XMLs ANA. Os números de teste artificiais são restritos à suíte, nunca usados nos feeds. Não se afirma que a origem oficial garante ausência de erros do fornecedor.
