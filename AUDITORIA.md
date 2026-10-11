# Auditoria da V2.4 — 11/10/2026

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

## Marinha × ANA: conferência de datas coincidentes

A Marinha de fato mantém [tabelas de alturas anteriores](https://www.marinha.mil.br/chn-6/alturaAnterioresRios). A V2.4 recupera 1.017 registros de **2025** dos PDFs oficiais: 365 de Cáceres, 365 de Ladário e 287 de Porto Murtinho (até 14/10). O acervo completo da Marinha não foi declarado inexistente ou limitado a essas datas. Não foi possível recuperar e certificar todo o período 1966–2025 diretamente dela; o histórico longo permanece ANA, como autorizado.

Foram abertos os PDFs, preservados seus textos, URLs, páginas e horários de captura em `data/snapshots/marinha-*-2025-web.json`. O download binário e a renderização retornaram erros HTTP 502 ou redirecionamento inacessível; **não houve inspeção visual dos PDFs**. O parser exige cabeçalho, estação/ano, 31 linhas, número exato de células por dia conforme o calendário e a cobertura da tabela, além de reproduzir mínimo, máximo e média publicados (tolerância de 0,011 m para arredondamento). Não extrai valores aproximados de gráficos nem interpreta células ambíguas. Essa limitação de verificação permanece explícita.

| Local | Pares com média ANA | Diferença média absoluta | Maior diferença absoluta | Diferença média absoluta usando ANA 7h |
| --- | ---: | ---: | ---: | ---: |
| Cáceres | 364 | 3,78 cm | 17,0 cm | 3,28 cm |
| Ladário | 364 | 0,34 cm | 5,0 cm | 0,09 cm |
| Porto Murtinho | 286 | 0,99 cm | 18,5 cm | 0,48 cm |

Diferença = Marinha menos ANA, sempre na mesma data/estação, sem deslocamento temporal. Há 1.014 pares elegíveis, não 1.017: um dia por estação não tem média diária elegível na seleção ANA. Datas sem par permanecem ausentes. Usar 7h reduz a diferença, mas não elimina todas as divergências: não se atribui causa exclusivamente ao horário nem se declara equivalência hidrométrica. Não foi estimado ou aplicado offset para forçar coincidência.

### Exemplo verificável: 11/10/2025

| Local | Marinha | ANA 7h | ANA 17h | Média diária ANA |
| --- | ---: | ---: | ---: | ---: |
| Cáceres | 0,68 m | 0,68 m | 0,68 m | 0,680 m |
| Ladário | 1,28 m | 1,27 m | 1,22 m | 1,245 m |
| Porto Murtinho | 2,38 m | 2,38 m | 2,37 m | 2,375 m |

Fontes Marinha em `data/history-marinha.json`; resposta ANA original em `data/snapshots/ana-history-2026-10-11.tar.gz`. `data/source-audit.csv` contém todos os pares, leituras horárias e diferenças; `data/source-audit.json` contém os resumos e rastreabilidade. Horários 7h/17h são os rótulos ANA; fuso não declarado, hora Marinha desconhecida.

## Comparações na interface

- A diferença com o ano anterior prioriza Marinha × Marinha: arquivo incremental, depois tabela histórica Marinha recuperada. Só na ausência exata usa ANA, com rótulo explícito de fontes diferentes. Não usa dia vizinho, inclusive em 29/02.
- Em 11/10/2026: Cáceres **47 cm acima**, Ladário **6 cm abaixo**, Porto Murtinho **49 cm acima** de 11/10/2025, usando Marinha nas duas datas. Mesmo órgão não certifica continuidade do zero/ponto.
- O **percentil** agora usa a **média ANA da mesma data** em relação às médias diárias ANA de 1966–2025. Fórmula: 100 × número de cotas menores ou iguais / total da estação. Empates entram. Valor, data e caráter parcial são exibidos; não há percentil quando falta ANA na data Marinha. O painel não calcula mais um percentil da leitura Marinha contra médias ANA.
- A telemetria recente é a média dos registros disponíveis, com frequência variável; o histórico usa médias publicadas. A mesma instituição não garante protocolo, cobertura diária ou datum homogêneos. Percentil é descritivo, não recorde certificado nem alerta.
- A seção de conferência mostra Marinha, média ANA, intervalo intradiário, número de registros e diferença na mesma data. Em Porto Murtinho, a ausência ANA após 06/09/2026 não é comparada com outubro como se fosse simultânea.
- Leituras Marinha acumuladas aparecem como pontos próprios nos gráficos de 2026; não substituem nem alteram a curva ou as estatísticas ANA. Novas coletas alimentam automaticamente os pontos e a conferência, sem calibração ou preenchimento oculto.

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
python scripts/recover_marinha.py
python scripts/build_source_audit.py
npm run build
python -m unittest discover -s tests -v
node --test tests/*.test.js
```

Os testes reproduzem todos os 63.425 registros históricos publicados no painel a partir dos XMLs arquivados e conferem os agregados iniciais de 2026 contra os XMLs ANA. Os números de teste artificiais são restritos à suíte, nunca usados nos feeds. Não se afirma que a origem oficial garante ausência de erros do fornecedor.
