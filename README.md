# Cota Rio Paraguai · V2.3

https://ernandes-sobreira.github.io/cota-rio-paraguai/

Cáceres, Ladário e Porto Murtinho: leituras pontuais da Marinha, médias diárias históricas ANA de 1966–2025 e registros intradiários ANA de 2026. Fontes separadas, sem preenchimento de lacunas.

## O que mudou

- Comparação da cota atual com o mesmo dia do ano anterior, identificando a fonte e o tipo de medida.
- Posição percentual em todos os 63.425 registros elegíveis da base histórica recuperada, por estação. Detalhes também mostram o mesmo dia do calendário em outros anos.
- Data da medição, primeira coleta do registro, última verificação e próxima tentativa programada diferenciadas.
- Cartões legíveis no celular; fontes locais; navegação compacta; gráficos sobrepostos e separados, água animada com pausa e movimento reduzido.
- Histórico antigo retirado dos cálculos por divergências encontradas na auditoria. Original intacto; reconstrução independente com XML oficial ANA e hashes. Consulte [AUDITORIA.md](AUDITORIA.md).
- Política de segurança de conteúdo, validação de feeds, rejeição de dados futuros ou ambíguos, preservação em falhas e testes de cálculos.

## Dados

| Conjunto | Caminho | Fonte |
| --- | --- | --- |
| Última leitura pontual | `data/latest.json` | Marinha / CHN-6 |
| Arquivo incremental Marinha | `data/daily.json` e `.csv` | Tabela oficial, por estação e data |
| Histórico 1966–2025 | `data/history-ana.csv` | ANA HidroSerieHistorica, médias diárias publicadas |
| Procedência do histórico | `data/history-provenance.json` | URLs, consultas, SHA-256, exclusões e diferenças |
| Registros de 2026 | `data/telemetry-daily.json` e `.csv` | ANA DadosHidrometeorologicos |
| Pontos documentais de Porto Murtinho | `data/sgb-supplement.json` | Cinco boletins SGB, identificados separadamente |
| Base antiga em auditoria | `rio_paraguai_estacoes_cota_diaria.csv` | Arquivo legado; não usado no painel V2.3 |

Os arquivos de `data/snapshots/` preservam respostas originais. Os XML ANA são em centímetros; a interface usa metros. Cada estação tem seu zero local. Cota não é profundidade nem vazão. A comparação Marinha × ANA é uma referência numérica: a continuidade de horário, local e datum não foi certificada. A posição histórica utiliza a base fechada 1966–2025; não concatena automaticamente diferentes protocolos de 2026.

A recuperação oficial conserva somente `MediaDiaria=1` e `NivelConsistencia=1`, sem misturar as linhas de média com leituras de 07h/17h. Status diário explícito diferente de 1 foi excluído conservadoramente; ausente fica desconhecido. Origem oficial não garante qualidade individual ou homogeneidade do histórico.

## Atualização automática

GitHub Actions consulta as fontes às 07h20, 08h20, 10h20 e 14h20 (MT, UTC−4), sujeito a atrasos. A coleta ANA foi executada com sucesso nesta revisão. O acesso direto à Marinha recebe 403; foi documentada uma tarefa ChatGPT complementar às 08h e 14h, com início previsto em 12/10/2026, mas sua execução ainda não foi confirmada nesta revisão. O coletor agora sinaliza o 403 como falha e preserva a última leitura. Não se garante execução futura: depende da disponibilidade e das conexões. [Contrato e horários](ATUALIZACAO.md).

A interface consulta o feed ao abrir, ao atualizar e a cada 15 minutos visível. O feed próprio é publicado em `raw.githubusercontent.com/ernandes-sobreira/cota-rio-paraguai/main/data/`; não é uma API oficial da Marinha. Erros preservam as observações e não mudam sua data. A ANA sinaliza falhas parciais no workflow. Arquivos não dependem de um novo build do Pages para atualizar no navegador.

## Reprodução

Python 3.12 e Node 22, sem bibliotecas externas.

```sh
# XMLs do histórico extraídos em .cache/history-source:
python scripts/recover_history.py --offline
python scripts/build_stats.py
npm run build
python -m unittest discover -s tests -v
npm test
```

`index.html` e `dashboard.js` são gerados. Edite `dashboard.template.html`, `dashboard-core.js`, `comparison-core.js`, `context-core.js`, `dashboard-client.js` e os CSS, depois rode o build. A página principal inclui gráficos e cartões antes de executar JavaScript; a data da cópia permanece identificada.

Idealização: **Ernandes Sobreira**. Organização original: **Claumir Cesar Muniz, Derick Victor de Souza Campos e Wilkinson Kiwi Lopes Lázaro**. Fontes recuperadas nesta versão: ANA, Marinha e SGB.

## V2.4 — conferência Marinha × ANA

A seção de conferência mostra valores e diferenças na mesma data. Foram recuperados 1.017 registros das tabelas oficiais Marinha de 2025 e comparados 1.014 pares elegíveis com a ANA. A comparação anual prioriza Marinha × Marinha; o percentil usa ANA da mesma data × histórico ANA. Sem dado na data exata, não se calcula posição nem diferença entre fontes. Novas leituras Marinha entram como pontos identificados nas curvas; não alteram médias, dispersões ou tendências ANA.

- [Auditoria e limitações](AUDITORIA.md)
- [Pares de dados e leituras horárias ANA](data/source-audit.csv)
- [Histórico Marinha recuperado](data/history-marinha.csv)
- [Fontes e transcrições](data/source-audit.json)

Reproduzir o acréscimo Marinha: `python scripts/recover_marinha.py`, depois `python scripts/build_source_audit.py` e `npm run build`. Os testes também reproduzem os registros importados a partir das transcrições e rejeitam células ambíguas.
