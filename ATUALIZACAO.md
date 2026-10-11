# Contrato da atualização diária — V2

Repositório: `ernandes-sobreira/cota-rio-paraguai`, branch `main`.
Fonte autorizada: https://www.marinha.mil.br/chn-6/ . Estações: Cáceres, Ladário, Porto Murtinho.

O coletor direto do GitHub Actions recebeu HTTP 403 em 11/10/2026. Não existe chave de API da Marinha configurada nem necessária para consultar a tabela pública. O complemento é uma automação agendada do ChatGPT que lê a página oficial e registra as células verificadas via API do GitHub. Não contornar autenticação, bloqueios ou controles de acesso. Se a página não estiver acessível pela leitura pública, preservar dados e relatar o impedimento.

## Execução do complemento

1. Ler este arquivo e `data/latest.json`, `data/daily.json` e o HEAD atual pelo GitHub conectado. Abrir a URL oficial com a ferramenta de navegação/pesquisa pública. Não confiar em snippets de pesquisa sem abrir a fonte. Usar as datas de cada linha: a data de hoje no cabeçalho não transforma observações antigas em atuais.
2. Capturar exclusivamente as cinco células publicadas para as três estações. Ausência de variação fica vazia e vira `null`, nunca zero. Guardar a observação do ponto de leitura; não misturar outras estações ou fontes. Não calcular retroativamente valores a partir de variações. Nunca preencher lacunas.
3. Produzir um snapshot JSON com `source_url`, `retrieved_at` ISO 8601 real em UTC, `retrieval_method: "verified_public_web"` e `rows` como lista de cinco células em texto. Executar `scripts/import_verified.py CAMINHO_SNAPSHOT` numa cópia atual do repositório. O script calcula o hash do snapshot, valida os dados, mescla por estação/data, preserva os dados anteriores e produz `data/latest.json`, `data/daily.json`, `data/daily.csv` e `data/snapshots/AAAA-MM-DD-verified.json`. Se dados atuais já estiverem presentes e idênticos, evitar commit desnecessário; atualizar verificação somente quando útil à saúde diária do feed.
4. Validar que cotas, variações e datas coincidem exatamente com a fonte. Verificar ausência de regressão de data no último registro de cada estação. Usar apenas data real da coleta em `last_success_at`; esse campo não é o horário da medição.
5. Publicar somente esses arquivos de dados num único commit do GitHub. Usar árvore baseada no HEAD recém-lido e atualizar `main` com `expected_sha` (sem force). Se houver concorrência, reler e mesclar sobre o novo HEAD. Não modificar interface, histórico, scripts, permissões ou credenciais na tarefa diária.
6. Reler `data/latest.json` no GitHub após o commit para confirmar. A interface usa esse feed público; publicação de novas leituras independe de novo build do Pages. Em caso de erro, manter a última observação e informar ao usuário apenas a falha que impede a atualização. Em sucesso normal, não enviar resumo de rotina.

## Agendamento direto

`.github/workflows/atualizar-cotas.yml`: 07h20, 08h20, 10h20 e 14h20 em MT (UTC−4). Horários são de consulta, não horários certificados da medição; o GitHub pode atrasar. `GITHUB_TOKEN` automático com `contents: write`, sem token pessoal exposto. Erro 403 é registrado como indisponibilidade do caminho direto. Outros erros de validação continuam a falhar o workflow.

O workflow também coleta a API pública da ANA com `scripts/update_telemetry.py --recent`, gerando `data/telemetry-daily.json` e `.csv`. Essa coleta é independente do complemento ChatGPT descrito acima: a tarefa ChatGPT continua alterando somente os arquivos Marinha, nunca os arquivos ANA ou SGB. A API ANA consultada não exige chave. Seus erros preservam as observações anteriores e são sinalizados no workflow.

A base antiga vai até 26/12/2025 e foi mantida apenas para auditoria. A V2.3 usa o histórico recuperado da ANA de 1966 a 31/12/2025 em data/history-ana.csv, com procedência em data/history-provenance.json. O arquivo incremental Marinha começa em 11/10/2026; o conjunto ANA foi recuperado desde 01/01/2026. Cobertura e lacunas estão em `DADOS_2026.md`. Não unir as séries para inferência sem verificar datum, ponto de medição e protocolo de observação.

A tarefa complementar foi verificada ativa na auditoria de 11/10/2026, com início em 12/10/2026 e horários 08h e 14h (America/Campo_Grande). Nenhuma execução futura é certificada antecipadamente. O coletor ANA guarda respostas recentes compactadas em data/snapshots/ana-rolling/; erros completos preservam fetched_at e registram checked_at/status, erros parciais retornam saída não zero.

## Conferência contínua V2.4

O painel calcula automaticamente a diferença Marinha menos média ANA somente para datas exatamente coincidentes, a cada atualização dos feeds. Ausência ANA não vira zero e não usa último dia antigo. Os registros Marinha incrementais alimentam pontos separados nas curvas, sem entrar nas estatísticas ANA. A comparação anual prioriza o arquivo incremental Marinha e depois as tabelas oficiais recuperadas de 2025 em `data/history-marinha.json` (incorporadas no overview). `data/source-audit.json/.csv` é uma auditoria histórica fixa de 2025, não a conferência viva do dia; não deve receber datas atuais pela tarefa diária. Os arquivos e permissões autorizados para a tarefa diária permanecem os mesmos.
